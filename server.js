const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3019;
const app = express();

// ===== Middleware =====
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// ===== MongoDB Connection =====
mongoose.connect('mongodb://127.0.0.1:27017/lib_login', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).catch(err => console.log('MongoDB connection error:', err));

const db = mongoose.connection;
db.once('open', () => console.log('Connected to MongoDB'));

// ===== Schemas & Models =====
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    borrowedBooks: [{
        bookId: mongoose.Schema.Types.ObjectId,
        title: String,
        dueDate: String
    }]
});
const Users = mongoose.model('users', userSchema);

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    isbn: String,
    available: { type: Boolean, default: true }
});
const Books = mongoose.model('books', bookSchema);

// ===== View Engine =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Authentication Middleware =====
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// ===== Routes ======

// Home/Login Page
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/contents');
    }
    res.render('login', { error: null });
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/contents');
    }
    res.render('login', { error: null });
});

app.get('/signup', (req, res) => {
    if (req.session.user) {
        return res.redirect('/contents');
    }
    res.render('signup', { error: null });
});

// Login POST
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Users.findOne({ username });
        if (!user) {
            return res.render('login', { error: 'User not found' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('login', { error: 'Incorrect password' });
        }

        req.session.user = user;
        res.redirect('/contents');
    } catch (error) {
        res.render('login', { error: 'Login failed. Please try again.' });
    }
});

// Signup POST
app.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await Users.findOne({ username });
        if (existingUser) {
            return res.render('signup', { error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Users({ username, password: hashedPassword });
        await newUser.save();
        req.session.user = newUser;
        res.redirect('/contents');
    } catch (error) {
        res.render('signup', { error: 'Signup failed. Please try again.' });
    }
});

// Contents Page (Library)
app.get('/contents', requireAuth, async (req, res) => {
    try {
        const books = await Books.find();
        const user = await Users.findById(req.session.user._id);
        res.render('contents', { books, user });
    } catch (error) {
        res.redirect('/login');
    }
});

// Borrow Book
app.post('/borrow', requireAuth, async (req, res) => {
    try {
        const { bookId } = req.body;
        const book = await Books.findById(bookId);
        if (!book || !book.available) {
            return res.redirect('/contents');
        }

        book.available = false;
        await book.save();

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);

        await Users.findByIdAndUpdate(
            req.session.user._id,
            {
                $push: {
                    borrowedBooks: {
                        bookId: book._id,
                        title: book.title,
                        dueDate: dueDate.toISOString().split('T')[0]
                    }
                }
            }
        );

        res.redirect('/contents');
    } catch (error) {
        res.redirect('/contents');
    }
});

// Borrowed Books Page
app.get('/borrowed', requireAuth, async (req, res) => {
    try {
        const user = await Users.findById(req.session.user._id);
        res.render('borrowed', { borrowedBooks: user.borrowedBooks });
    } catch (error) {
        res.redirect('/contents');
    }
});

// Return Book
app.post('/return', requireAuth, async (req, res) => {
    try {
        const { bookId } = req.body;
        await Users.findByIdAndUpdate(
            req.session.user._id,
            { $pull: { borrowedBooks: { bookId } } }
        );
        await Books.findByIdAndUpdate(bookId, { available: true });
        res.redirect('/borrowed');
    } catch (error) {
        res.redirect('/borrowed');
    }
});

// Account Page
app.get('/account', requireAuth, async (req, res) => {
    try {
        const user = await Users.findById(req.session.user._id);
        res.render('account', { user });
    } catch (error) {
        res.redirect('/contents');
    }
});

// Change Password
app.post('/account/password', requireAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await Users.findByIdAndUpdate(
            req.session.user._id,
            { password: hashedPassword }
        );
        res.redirect('/account');
    } catch (error) {
        res.redirect('/account');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ===== Start Server =====
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
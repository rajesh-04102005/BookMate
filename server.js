// server.js
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3019;
const app = express();

// ===== Middleware =====
app.use(express.static(path.join(__dirname, 'public'))); // Serve CSS/JS
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
});

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

// ===== Routes =====

// Home/Login Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Signup Page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// Register User
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;
    const existingUser = await Users.findOne({ username });
    if (existingUser) return res.send('Username already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new Users({ username, password: hashedPassword });
    await newUser.save();
    res.redirect('/');
});

// Login User
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await Users.findOne({ username });
    if (!user) return res.redirect('/signup');

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.redirect('/signup');

    req.session.user = user;
    res.redirect('/content');
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Content Page - Show all books
app.get('/content', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const books = await Books.find();
    const user = await Users.findById(req.session.user._id);
    res.render('contents', { books, user });
});

// Search Books
app.get('/search', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { q } = req.query;
    const books = await Books.find({
        $or: [
            { title: { $regex: q, $options: 'i' } },
            { author: { $regex: q, $options: 'i' } },
            { isbn: { $regex: q, $options: 'i' } }
        ]
    });
    const user = await Users.findById(req.session.user._id);
    res.render('contents', { books, user });
});

// Borrow Book
app.post('/borrow', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { bookId } = req.body;
    const book = await Books.findById(bookId);
    if (!book || !book.available) return res.send('Book not available');

    book.available = false;
    await book.save();

    // Set dynamic due date (2 weeks from today)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    await Users.updateOne(
        { _id: req.session.user._id },
        { $push: { borrowedBooks: { bookId: book._id, title: book.title, dueDate: dueDate.toISOString().split('T')[0] } } }
    );
    res.redirect('/content');
});

// Borrowed Books Page
app.get('/borrowed', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = await Users.findById(req.session.user._id);
    res.render('borrowed', { borrowedBooks: user.borrowedBooks });
});

// Return Book
app.post('/return', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { bookId } = req.body;

    await Users.updateOne(
        { _id: req.session.user._id },
        { $pull: { borrowedBooks: { bookId } } }
    );

    await Books.findByIdAndUpdate(bookId, { available: true });
    res.redirect('/borrowed');
});

// My Account Page
app.get('/account', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const user = await Users.findById(req.session.user._id);
    res.render('account', { user });
});

// Change Password
app.post('/account/password', async (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const { newPassword } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await Users.updateOne({ _id: req.session.user._id }, { password: hashedPassword });
    res.send('Password updated successfully! <a href="/content">Back</a>');
});

// ===== Start Server =====
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

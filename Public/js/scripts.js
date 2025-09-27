document.getElementById("loginForm").addEventListener("submit", function(event) {
    let username = document.getElementById("username").value;
    let password = document.getElementById("password").value;

    if (username === "" || password === "") {
        alert("Both fields are required!");
        event.preventDefault();
    }
});

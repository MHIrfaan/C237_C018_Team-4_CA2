const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const path = require('path');
const multer = require('multer'); // Used for file uploads like your reference app

const app = express();

// ======================
// THE NO-SQL IMAGE HACK
// ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); 
    },
    filename: (req, file, cb) => {
        // We force the filename to be the user's ID so the database doesn't need to remember it!
        cb(null, 'profile_' + req.session.user.id + '.jpg'); 
    }
});
const upload = multer({ storage: storage });

// ======================
// DATABASE CONNECTION
// ======================
const db = mysql.createConnection({
    host: 'c237-sweekwang-mysql.mysql.database.azure.com',
    user: 'c237_018',
    password: 'c237018@2026!',
    database: 'c237_018_team4',
    ssl: { rejectUnauthorized: true }
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err);
    } else {
        console.log("Connected to MySQL");
    }
});

// ======================
// MIDDLEWARE
// ======================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'studytrack_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// ======================
// AUTH MIDDLEWARE
// ======================
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function checkAdmin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role !== 'admin') {
        return res.send("Access Denied: Admins Only");
    }
    next();
}

// ======================
// ROUTES
// ======================
app.get('/', (req, res) => {
    res.redirect('/login');
});

// --- REGISTER ---
app.get('/register', (req, res) => {
    res.render('register', {
        error: null, success: null,
        username: '', email: '', address: '', contact: '', image: ''
    });
});

app.post('/register', (req, res) => {
    const { username, email, password, confirmPassword, address, contact, adminCode } = req.body;

    const renderError = (msg) => {
        return res.render('register', {
            error: msg, success: null,
            username, email, address, contact 
        });
    };

    let assignedRole = 'student'; 
    
    // Check if the user typed the exact admin code
    if (adminCode && adminCode.trim() !== '') {
        if (adminCode === 'admin') {
            assignedRole = 'admin'; 
        } else {
            return renderError("Invalid Admin Code. Leave this blank if you are a student.");
        }
    }

    if (!username || !email || !password || !confirmPassword || !address || !contact) {
        return renderError("Please fill in all required fields.");
    }
    if (password.length < 6) {
        return renderError("Password must be at least 6 characters.");
    }
    if (password !== confirmPassword) {
        return renderError("Passwords do not match.");
    }

    const checkSql = "SELECT * FROM users WHERE username=? OR email=?";
    db.query(checkSql, [username, email], (err, results) => {
        if (err) return res.send("Database Error: " + err.message);
        if (results.length > 0) {
            return renderError("Username or Email already exists.");
        }

        const insertSql = `
        INSERT INTO users (username,email,password,address,contact,role)
        VALUES (?, ?, SHA1(?), ?, ?, ?)`;

        db.query(insertSql, [username, email, password, address, contact, assignedRole], (err, result) => {
            if (err) return res.send("Registration Failed: " + err.message);
            res.render('register', {
                error: null, 
                success: "Registration successful! You will now be redirected to login.",
                username: '', email: '', address: '', contact: ''
            });
        });
    });
});

// --- LOGIN ---
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.render('login', { error: "Please enter username and password." });
    }

    const sql = `SELECT * FROM users WHERE username=? AND password=SHA1(?)`;
    db.query(sql, [username, password], (err, results) => {
        if (err) return res.send("Database Error: " + err.message);
        if (results.length == 0) {
            return res.render('login', { error: "Invalid username or password." });
        }

        const user = results[0];
        req.session.user = { 
            id: user.id, 
            username: user.username, 
            role: user.role,
            // Fallback since DB doesn't have an image column
            image: 'profile icon_5.webp' 
        };

        if (user.role === "admin") return res.redirect('/admin');
        res.redirect('/dashboard');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// --- EDIT PROFILE ---
app.get('/profile/edit', checkAuth, (req, res) => {
    const userId = req.session.user.id;
    db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || results.length === 0) return res.send("User not found.");
        res.render('editProfile', { userProfile: results[0], user: req.session.user });
    });
});

// Multer handles the image upload, SQL only handles the text details!
app.post('/profile/edit', checkAuth, upload.single('image'), (req, res) => {
    const userId = req.session.user.id;
    const { username, email, contact, address } = req.body;

    const sql = `UPDATE users SET username=?, email=?, address=?, contact=? WHERE id=?`;
    db.query(sql, [username, email, address, contact, userId], (err) => {
        if (err) return res.send("Error updating profile: " + err.message);
        req.session.user.username = username;
        res.redirect('/dashboard');
    });
});

// --- STUDENT DASHBOARD (READ) ---
app.get('/dashboard', checkAuth, (req, res) => {
    const userId = req.session.user.id;
    const sql = `SELECT id, title, description, module, task_type, priority, DATE_FORMAT(deadline, '%Y-%m-%d') as deadline, status FROM tasks WHERE user_id = ? ORDER BY deadline ASC`;
    
    db.query(sql, [userId], (err, tasks) => {
        if (err) return res.send("Error fetching tasks: " + err.message);
        res.render('dashboard', { user: req.session.user, tasks: tasks });
    });
});

// --- ADD TASK (CREATE) ---
app.get('/task/add', checkAuth, (req, res) => {
    const defaultDeadline = req.query.deadline || '';
    res.render('addTask', { error: null, formData: { deadline: defaultDeadline }, user: req.session.user });
});

app.post('/task/add', checkAuth, (req, res) => {
    const userId = req.session.user.id;
    let { title, description, module, task_type, priority, deadline } = req.body;

    title = title ? title.trim() : '';
    description = description ? description.trim() : '';
    module = module ? module.trim().toUpperCase() : '';

    const sql = `INSERT INTO tasks (user_id, title, description, module, task_type, priority, deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [userId, title, description || null, module, task_type, priority, deadline, 'Pending'], (err, results) => {
        if (err) return res.send("Error adding task: " + err.message);
        res.redirect('/dashboard');
    });
});

// --- EDIT TASK (UPDATE) ---
app.get('/task/edit/:id', checkAuth, (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.user.id;
    const sql = `SELECT id, title, description, module, task_type, priority, DATE_FORMAT(deadline, '%Y-%m-%d') as deadline, status FROM tasks WHERE id = ? AND user_id = ?`;

    db.query(sql, [taskId, userId], (err, results) => {
        if (err) return res.send("Database error: " + err.message);
        if (results.length === 0) return res.send("Task not found.");
        res.render('editTask', { task: results[0] });
    });
});

app.post('/task/edit/:id', checkAuth, (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, module, task_type, priority, deadline, status } = req.body;

    const sql = `UPDATE tasks SET title=?, description=?, module=?, task_type=?, priority=?, deadline=?, status=? WHERE id=? AND user_id=?`;
    db.query(sql, [title, description, module, task_type, priority, deadline, status, taskId, userId], (err, results) => {
        if (err) return res.send("Error updating task: " + err.message);
        res.redirect('/dashboard');
    });
});

// --- MARK TASK AS COMPLETED / UNCOMPLETED (UPDATE) ---
app.post('/task/complete/:id', checkAuth, (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.user.id;

    const checkSql = `SELECT status FROM tasks WHERE id = ? AND user_id = ?`;
    db.query(checkSql, [taskId, userId], (err, results) => {
        if (err) return res.send("Error checking task: " + err.message);
        if (results.length === 0) return res.send("Task not found.");

        const newStatus = results[0].status === 'Completed' ? 'Pending' : 'Completed';
        const updateSql = `UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?`;
        db.query(updateSql, [newStatus, taskId, userId], (err) => {
            if (err) return res.send("Error updating task status: " + err.message);
            res.redirect('/dashboard');
        });
    });
});

// --- DELETE TASK (DELETE) ---
app.post('/task/delete/:id', checkAuth, (req, res) => {
    const taskId = req.params.id;
    const userId = req.session.user.id;
    const sql = `DELETE FROM tasks WHERE id = ? AND user_id = ?`;

    db.query(sql, [taskId, userId], (err, results) => {
        if (err) return res.send("Error deleting task: " + err.message);
        if (results.affectedRows === 0) return res.send("Task not found or not yours.");
        res.redirect('/dashboard');
    });
});

// ======================
// ADMIN ROUTES
// ======================
app.get('/admin', checkAuth, checkAdmin, (req, res) => {
    
    // FIXED: Removed 'profile_pic' from the SQL query since the database doesn't have that column!
    db.query('SELECT id, username, email, role FROM users', (err, allUsers) => {
        if (err) return res.send("Error loading users: " + err.message); 

        const taskSql = `
            SELECT tasks.id, tasks.user_id, tasks.title, tasks.module, tasks.status, DATE_FORMAT(tasks.deadline, '%Y-%m-%d') as deadline, users.username 
            FROM tasks 
            JOIN users ON tasks.user_id = users.id 
            ORDER BY tasks.deadline ASC
        `;
        
        db.query(taskSql, (err, allTasks) => {
            if (err) return res.send("Error loading tasks: " + err.message);

            allUsers.forEach(u => {
                const userTasks = allTasks.filter(t => t.user_id === u.id);
                const userTotal = userTasks.length;
                const userCompleted = userTasks.filter(t => t.status === 'Completed').length;
                u.progress = userTotal === 0 ? 0 : Math.round((userCompleted / userTotal) * 100);
            });

            const totalUsers = allUsers.length;
            const totalTasks = allTasks.length;
            const completedTasks = allTasks.filter(t => t.status === 'Completed').length;
            const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

            res.render('admin', { 
                user: req.session.user, 
                users: allUsers,
                tasks: allTasks,
                stats: { totalUsers, totalTasks, completionRate },
                userProgress: allUsers.reduce((acc, user) => { acc[user.id] = user.progress; return acc; }, {}) // Added to safely pass progress to EJS
            });
        });
    });
});

app.get('/admin/delete_user/:id', checkAuth, checkAdmin, (req, res) => {
    const userIdToDelete = req.params.id;
    if (userIdToDelete == req.session.user.id) return res.send("You cannot delete your own admin account.");

    db.query('DELETE FROM users WHERE id = ?', [userIdToDelete], (err) => {
        if (err) return res.send("Error deleting user: " + err.message);
        res.redirect('/admin');
    });
});

app.get('/admin/delete_task/:id', checkAuth, checkAdmin, (req, res) => {
    db.query('DELETE FROM tasks WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.send("Error deleting task: " + err.message);
        res.redirect('/admin');
    });
});

// ======================
// SERVER
// ======================
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// Database setup
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database');
});

// Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        image TEXT,
        vendor_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        buyer_id INTEGER
    )`);
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'foodora_secret', resave: false, saveUninitialized: true }));

// File upload setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const role = req.session.role;
        let folder = 'products';
        if(role === 'Vendor') folder = 'vendors';
        else folder = 'customers';
        cb(null, `./public/uploads/${folder}`);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Registration
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, hashedPassword, role], function(err){
        if(err) return res.send('Error registering user');
        res.redirect('/');
    });
});

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if(!user) return res.send('User not found');
        const match = await bcrypt.compare(password, user.password);
        if(match){
            req.session.userId = user.id;
            req.session.role = user.role;
            res.redirect('/dashboard.html');
        } else {
            res.send('Wrong password');
        }
    });
});

// Add product (Vendor)
app.post('/add-product', upload.single('image'), (req, res) => {
    const { name, price } = req.body;
    const image = req.file.filename;
    const vendor_id = req.session.userId;
    db.run(`INSERT INTO products (name, price, image, vendor_id) VALUES (?, ?, ?, ?)`, [name, price, image, vendor_id], function(err){
        if(err) return res.send('Error adding product');
        res.redirect('/dashboard.html');
    });
});

// Get products
app.get('/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if(err) return res.send([]);
        res.json(rows);
    });
});

// Order product (Buyer)
app.post('/order', (req, res) => {
    const { product_id } = req.body;
    const buyer_id = req.session.userId;
    db.run(`INSERT INTO orders (product_id, buyer_id) VALUES (?, ?)`, [product_id, buyer_id], function(err){
        if(err) return res.send('Error ordering product');
        res.send('Order placed successfully');
    });
});

app.listen(PORT, () => console.log(`FoodoraHub running on http://localhost:${PORT}`));

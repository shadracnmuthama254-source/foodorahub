const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

// Ensure upload folders exist
['vendors','customers','products'].forEach(f => {
  const dir = path.join(__dirname,'public','uploads',f);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
});

// Database
const db = new sqlite3.Database('./database.db');

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    image TEXT,
    vendor_id INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    buyer_id INTEGER
  )`);
});

app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

app.use(session({
  secret:'CHANGE_THIS_TO_RANDOM_SECRET',
  resave:false,
  saveUninitialized:false,
  cookie:{ httpOnly:true }
}));

// Auth middleware
function requireLogin(req,res,next){
  if(!req.session.userId) return res.send("Login required");
  next();
}

function requireVendor(req,res,next){
  if(req.session.role!=='Vendor') return res.send("Vendor only");
  next();
}

// Upload config
const storage = multer.diskStorage({
 destination:(req,file,cb)=>{
   let folder='products';
   if(req.session.role==='Vendor') folder='vendors';
   if(req.session.role==='Customer') folder='customers';
   cb(null,'./public/uploads/'+folder);
 },
 filename:(req,file,cb)=>{
   cb(null,Date.now()+path.extname(file.originalname));
 }
});

const upload = multer({storage});

// Routes
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));

// Register
app.post('/register', async (req,res)=>{
 const {username,password,role}=req.body;
 if(!username||!password||!role) return res.send('Missing fields');

 const hash = await bcrypt.hash(password,10);

 db.run(`INSERT INTO users(username,password,role) VALUES(?,?,?)`,
 [username,hash,role],
 err=>{
   if(err) return res.send('User exists or error');
   res.redirect('/');
 });
});

// Login
app.post('/login',(req,res)=>{
 const {username,password}=req.body;

 db.get(`SELECT * FROM users WHERE username=?`,
 [username],
 async(err,user)=>{
   if(!user) return res.send('User not found');

   const ok = await bcrypt.compare(password,user.password);

   if(ok){
     req.session.userId=user.id;
     req.session.role=user.role;
     res.redirect('/dashboard.html');
   }else{
     res.send('Wrong password');
   }
 });
});

// Logout
app.get('/logout',(req,res)=>{
  req.session.destroy(()=>res.redirect('/'));
});

// Add product (vendor only)
app.post('/add-product', requireLogin, requireVendor, upload.single('image'), (req,res)=>{
 const {name,price}=req.body;
 if(!req.file) return res.send('Image required');

 db.run(`INSERT INTO products(name,price,image,vendor_id) VALUES(?,?,?,?)`,
 [name,price,req.file.filename,req.session.userId],
 ()=>res.redirect('/dashboard.html'));
});

// Get products
app.get('/products',(req,res)=>{
 db.all(`SELECT * FROM products`,[],(err,rows)=>{
   res.json(rows||[]);
 });
});

// Order product
app.post('/order', requireLogin, (req,res)=>{
 db.run(`INSERT INTO orders(product_id,buyer_id) VALUES(?,?)`,
 [req.body.product_id,req.session.userId],
 ()=>res.send('Order placed'));
});

app.listen(PORT,()=>console.log("Running on http://localhost:"+PORT));
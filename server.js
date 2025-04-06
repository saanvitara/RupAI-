// server.js - Main backend file
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML file from 'public' folder

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/financeapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define Schemas
const UserSchema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  goals: {
    monthlySavingsGoal: { type: Number, default: 0 },
    dailySpendingLimit: { type: Number, default: 0 },
    savingsTarget: { type: Number, default: 0 },
    targetDate: { type: Date }
  },
  savingsStreak: { type: Number, default: 0 },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const ExpenseSchema = mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  amount: { type: Number, required: true },
  mood: String,
  reason: String,
  date: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);

// Auth middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, 'your_jwt_secret');
    const user = await User.findById(decoded.id);
    if (!user) throw new Error();
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    res.status(401).send({ error: 'Please authenticate' });
  }
};

// Routes
// Authentication
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ id: user._id }, 'your_jwt_secret');
    res.status(201).send({ user, token });
  } catch (error) {
    res.status(400).send(error);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: 'User not found' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, 'your_jwt_secret');
    res.send({ user, token });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Expense routes
app.post('/api/expenses', authenticate, async (req, res) => {
  try {
    const expense = new Expense({
      ...req.body,
      userId: req.user._id
    });
    await expense.save();
    res.status(201).send(expense);
  } catch (error) {
    res.status(400).send(error);
  }
});

app.get('/api/expenses', authenticate, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user._id });
    res.send(expenses);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Dashboard data
app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    // Get today's expenses
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayExpenses = await Expense.find({
      userId: req.user._id,
      date: { $gte: today }
    });
    
    // Calculate spent today
    const spentToday = todayExpenses.reduce((total, expense) => total + expense.amount, 0);
    
    // Get last expense
    const lastExpense = await Expense.findOne({ userId: req.user._id }).sort({ date: -1 });
    
    // Get top spending categories
    const categories = await Expense.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
      { $limit: 4 }
    ]);
    
    res.send({
      spentToday,
      lastExpense,
      savingsStreak: req.user.savingsStreak,
      topCategories: categories,
      goals: req.user.goals
    });
  } catch (error) {
    res.status(500).send(error);
  }
});

// Update goals
app.post('/api/goals', authenticate, async (req, res) => {
  try {
    req.user.goals = req.body;
    await req.user.save();
    res.send(req.user);
  } catch (error) {
    res.status(400).send(error);
  }
});

// Friends routes
app.get('/api/friends/suggest', authenticate, async (req, res) => {
  try {
    const suggestions = await User.find({ 
      _id: { $ne: req.user._id },
      _id: { $nin: req.user.friends }
    }).limit(5).select('-password');
    res.send(suggestions);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post('/api/friends/add/:id', authenticate, async (req, res) => {
  try {
    if (req.user.friends.includes(req.params.id)) {
      return res.status(400).send({ error: 'Already a friend' });
    }
    req.user.friends.push(req.params.id);
    await req.user.save();
    res.send(req.user);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
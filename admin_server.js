const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000; 

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// ክላውድ ዳታቤዝ ማገናኛ
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ Connected to MongoDB Atlas'))
        .catch(err => console.error('❌ DB Error:', err));
}

// ----------------- የክላውድ ሞዴሎች (MONGOOSE SCHEMAS) -----------------
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 }
});
const User = mongoose.model('User', userSchema);

const depositSchema = new mongoose.Schema({
    id: String, userPhone: String, amount: Number, senderPhone: String, method: String, screenshot: String, status: { type: String, default: 'PENDING' }, date: String
});
const Deposit = mongoose.model('Deposit', depositSchema);

const withdrawSchema = new mongoose.Schema({
    id: String, userPhone: String, amount: Number, accountNumber: String, fullName: String, method: String, status: { type: String, default: 'PENDING' }, date: String
});
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

const historySchema = new mongoose.Schema({
    roundNumber: Number, results: [Number], timestamp: String
});
const History = mongoose.model('History', historySchema);

// ----------------- 🎯 ማስተካከያ፦ የገጾች መክፈቻ መስመሮች (Vercel Fix) -----------------
app.get('/', (req, res) => { 
    res.sendFile(path.join(process.cwd(), 'Dashbet3.html')); 
});
app.get('/admin-panel', (req, res) => { 
    res.sendFile(path.join(process.cwd(), 'admin.html')); 
});

// ----------------- ኤፒአይ መንገዶች (API ROUTES) -----------------
app.post('/login', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ!" });
    phone = phone.trim();
    try {
        const user = await User.findOne({ phone });
        if (user && user.password === password) {
            return res.json({ success: true, user: { phone: user.phone, balance: user.balance } });
        }
        return res.json({ success: false, message: "⚠️ ስልክ ቁጥር ወይም የይለፍ ቃል የተሳሳተ ነው!" });
    } catch(e) { res.json({ success: false }); }
});

app.post('/register', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ሁሉንም ፎርም በትክክል ይሙሉ!" });
    phone = phone.trim();
    try {
        const existing = await User.findOne({ phone });
        if (existing) return res.json({ success: false, message: "❌ ይህ ስልክ ቁጥር ቀድሞ የተመዘገበ ነው!" });
        const newUser = new User({ phone, password, balance: 1803.00 });
        await newUser.save();
        res.json({ success: true, message: "✅ ምዝገባዎ በቋሚነት ተጠናቋል! አሁን መግባት ይችላሉ።" });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/place-bet', async (req, res) => {
    let { userPhone, betAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user || user.balance < parseFloat(betAmount)) return res.json({ success: false });
        user.balance -= parseFloat(betAmount);
        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/claim-win', async (req, res) => {
    let { userPhone, winAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user) return res.json({ success: false });
        user.balance += parseFloat(winAmount);
        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/save-draw', async (req, res) => {
    const { roundNumber, results } = req.body;
    try {
        const newHistory = new History({ roundNumber, results, timestamp: new Date().toISOString() });
        await newHistory.save();
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.get('/api/draw-history', async (req, res) => {
    try {
        const history = await History.find({}).sort({ _id: -1 }).limit(30);
        res.json(history);
    } catch(e) { res.json([]); }
});

app.post('/api/deposit', async (req, res) => {
    let { userPhone, amount, senderPhone, method, screenshot } = req.body;
    try {
        const newDep = new Deposit({ id: 'DEP-' + Date.now(), userPhone: userPhone.trim(), amount: parseFloat(amount), senderPhone, method, screenshot: screenshot || "", status: 'PENDING', date: new Date().toLocaleString('am-ET') });
        await newDep.save();
        res.json({ success: true, message: "✅ የዲፖዚት ጥያቄዎ ለአድሚን ደርሷል!" });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/withdraw', async (req, res) => {
    let { userPhone, amount, accountNumber, fullName, method } = req.body;
    try {
        const cleanPhone = userPhone.trim();
        const user = await User.findOne({ phone: cleanPhone });
        if (!user) return res.json({ success: false, message: "❌ ተጠቃሚው አልተገኘም!" });
        const reqAmount = parseFloat(amount);
        if (reqAmount < 80) return res.json({ success: false, message: "❌ ማውጣት የሚቻለው አነስተኛ መጠን 80 ETB ነው!" });
        const pendings = await Withdraw.find({ userPhone: cleanPhone, status: 'PENDING' });
        const pendingWithdrawAmount = pendings.reduce((sum, w) => sum + w.amount, 0);
        const availableToWithdraw = user.balance - pendingWithdrawAmount;
        if (reqAmount > availableToWithdraw) {
            return res.json({ success: false, message: `❌ በቂ ቀሪ ሂሳብ የሎትም!` });
        }
        const newWith = new Withdraw({ id: 'WITH-' + Date.now(), userPhone: cleanPhone, amount: reqAmount, accountNumber, fullName, method, status: 'PENDING', date: new Date().toLocaleString('am-ET') });
        await newWith.save();
        res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ በተሳካ ሁኔታ ለአድሚን ተልኳል!" });
    } catch(e) { res.json({ success: false }); }
});

app.post('/admin/process-deposit', async (req, res) => {
    const { id, action } = req.body;
    try {
        const dep = await Deposit.findOne({ id });
        if (!dep) return res.json({ success: false });
        if (action === 'APPROVE') {
            dep.status = 'APPROVED';
            const user = await User.findOne({ phone: dep.userPhone });
            if (user) { user.balance += dep.amount; await user.save(); }
        } else { dep.status = 'REJECTED'; }
        await dep.save();
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/admin/process-withdrawal', async (req, res) => {
    const { id, action } = req.body;
    try {
        const wit = await Withdraw.findOne({ id });
        if (!wit) return res.json({ success: false });
        if (action === 'APPROVE') {
            const user = await User.findOne({ phone: wit.userPhone });
            if (user && user.balance >= wit.amount) {
                wit.status = 'APPROVED';
                user.balance -= wit.amount;
                await user.save();
            } else { return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የለም!" }); }
        } else { wit.status = 'REJECTED'; }
        await wit.save();
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.get('/admin/stats', async (req, res) => {
    try {
        const users = await User.find({});
        const deps = await Deposit.find({ status: 'PENDING' });
        const wits = await Withdraw.find({ status: 'PENDING' });
        let totalCapital = users.reduce((sum, u) => sum + u.balance, 0);
        res.json({ totalUsers: users.length, pendingDeposits: deps.length, pendingWithdrawals: wits.length, totalCapital });
    } catch(e) { res.json({ totalUsers: 0, pendingDeposits: 0, pendingWithdrawals: 0, totalCapital: 0 }); }
});

app.get('/admin/deposits', async (req, res) => { try { const d = await Deposit.find({}); res.json(d); } catch(e) {res.json([]);} });
app.get('/admin/withdrawals', async (req, res) => { try { const w = await Withdraw.find({}); res.json(w); } catch(e) {res.json([]);} });
app.get('/admin/users', async (req, res) => { try { const u = await User.find({}); res.json(u); } catch(e) {res.json([]);} });

module.exports = app;

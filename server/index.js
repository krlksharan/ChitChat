const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./database');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '.data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'media-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });
const { router: authRouter, JWT_SECRET } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve uploaded files statically from .data/uploads
app.use('/uploads', express.static(path.join(__dirname, '.data', 'uploads')));

// Serve React frontend in production
app.use(express.static(path.join(__dirname, '../client/dist')));

// Middleware to authenticate API requests
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Auth Routes
app.use('/auth', authRouter);

// Contact Routes
app.get('/api/contacts', authenticateToken, (req, res) => {
  db.all(
    `SELECT u.id, u.username FROM users u 
     INNER JOIN contacts c ON u.id = c.contact_id 
     WHERE c.user_id = ?`, 
    [req.user.id], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

app.post('/api/contacts/add', authenticateToken, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (username === req.user.username) return res.status(400).json({ error: 'Cannot add yourself' });

  // Find user by username
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, contactUser) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!contactUser) return res.status(404).json({ error: 'User not found' });

    // Insert bidirectional contact
    db.run('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)', [req.user.id, contactUser.id]);
    db.run('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)', [contactUser.id, req.user.id], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to add contact' });
      res.json({ message: 'Contact added successfully', contact: { id: contactUser.id, username } });
    });
  });
});

// Messages Routes
app.get('/api/messages/:contactId', authenticateToken, (req, res) => {
  const contactId = req.params.contactId;
  const userId = req.user.id;

  db.all(
    `SELECT * FROM messages 
     WHERE (sender_id = ? AND receiver_id = ?) 
        OR (sender_id = ? AND receiver_id = ?) 
     ORDER BY created_at ASC LIMIT 100`, 
    [userId, contactId, contactId, userId], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// Socket.IO Connection and Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error: Invalid token'));
    socket.user = decoded;
    next();
  });
});

// Store online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);
  
  // Join a room with their user ID for private messaging
  socket.join(socket.user.id.toString());

  onlineUsers.set(socket.user.id, {
    socketId: socket.id,
    username: socket.user.username
  });

  io.emit('online_users', Array.from(onlineUsers.values()));

  socket.on('send_message', (data) => {
    const { content, receiver_id } = data;
    const sender_id = socket.user.id;
    
    if (!receiver_id) return;

    // Save to database
    db.run(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [sender_id, receiver_id, content],
      function(err) {
        if (err) return console.error('Error saving message', err.message);
        
        const newMessage = {
          id: this.lastID,
          sender_id,
          receiver_id,
          content,
          created_at: new Date().toISOString()
        };
        
        // Send to receiver
        io.to(receiver_id.toString()).emit('receive_message', newMessage);
        // Send back to sender
        socket.emit('receive_message', newMessage);
      }
    );
  });

  socket.on('typing', (data) => {
    if (data && data.receiver_id) {
      io.to(data.receiver_id.toString()).emit('user_typing', socket.user.id);
    }
  });
  
  socket.on('stop_typing', (data) => {
    if (data && data.receiver_id) {
      io.to(data.receiver_id.toString()).emit('user_stop_typing', socket.user.id);
    }
  });

  socket.on('clear_messages', (data) => {
    const { contact_id } = data;
    const user_id = socket.user.id;
    if (!contact_id) return;
    
    db.run(
      'DELETE FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)', 
      [user_id, contact_id, contact_id, user_id], 
      (err) => {
        if (err) return console.error('Error clearing messages', err.message);
        socket.emit('messages_cleared', contact_id);
        io.to(contact_id.toString()).emit('messages_cleared', user_id);
      }
    );
  });

  // WebRTC Signaling (Private)
  socket.on('webrtc_offer', (data) => {
    const { offer, receiver_id } = data;
    if (receiver_id) {
      io.to(receiver_id.toString()).emit('webrtc_offer', { offer, caller_id: socket.user.id, caller_username: socket.user.username });
    }
  });

  socket.on('webrtc_answer', (data) => {
    const { answer, receiver_id } = data;
    if (receiver_id) {
      io.to(receiver_id.toString()).emit('webrtc_answer', { answer, responder_id: socket.user.id });
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { candidate, receiver_id } = data;
    if (receiver_id) {
      io.to(receiver_id.toString()).emit('webrtc_ice_candidate', { candidate, from_id: socket.user.id });
    }
  });

  // Message Deletion
  socket.on('delete_message', (messageId) => {
    // Basic implementation: anyone can delete for now, or check sender_id in a real app
    db.run('DELETE FROM messages WHERE id = ?', [messageId], (err) => {
      if (err) return console.error('Error deleting message', err.message);
      // We would need to know the receiver_id to broadcast this privately, 
      // but for simplicity we broadcast to everyone for this specific message deletion.
      io.emit('message_deleted', messageId);
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username}`);
    onlineUsers.delete(socket.user.id);
    io.emit('online_users', Array.from(onlineUsers.values()));
  });
});

const PORT = process.env.PORT || 3000;
// Fallback for React Router (Single Page App)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

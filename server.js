const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const moment = require('moment');

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new sqlite3.Database('sports_complex.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS facilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            capacity INTEGER
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            facility_id INTEGER,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            status TEXT DEFAULT 'pending',
            FOREIGN KEY (client_id) REFERENCES clients (id),
            FOREIGN KEY (facility_id) REFERENCES facilities (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            duration INTEGER NOT NULL,
            price REAL NOT NULL,
            description TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            membership_id INTEGER,
            amount REAL NOT NULL,
            payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients (id),
            FOREIGN KEY (membership_id) REFERENCES memberships (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_id INTEGER,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            activity_name TEXT NOT NULL,
            trainer TEXT,
            FOREIGN KEY (facility_id) REFERENCES facilities (id)
        )`);

        db.get('SELECT COUNT(*) as count FROM facilities', (err, row) => {
            if (!err && row.count === 0) {
                const stmt = db.prepare('INSERT INTO facilities (name, type, capacity) VALUES (?, ?, ?)');
                stmt.run('Тренажерный зал', 'gym', 30);
                stmt.run('Бассейн', 'pool', 20);
                stmt.run('Зал для йоги', 'yoga', 15);
                stmt.finalize();
            }
        });
    });
}

app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

app.get('/api/clients', (req, res) => {
    db.all('SELECT * FROM clients ORDER BY name', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.get('/api/clients/:id', (req, res) => {
    db.get('SELECT * FROM clients WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Client not found' });
            return;
        }
        res.json(row);
    });
});

app.post('/api/clients', (req, res) => {
    const { name, phone, email } = req.body;
    db.run('INSERT INTO clients (name, phone, email) VALUES (?, ?, ?)',
        [name, phone, email],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.put('/api/clients/:id', (req, res) => {
    const { name, phone, email } = req.body;
    db.run('UPDATE clients SET name = ?, phone = ?, email = ? WHERE id = ?',
        [name, phone, email, req.params.id],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        });
});

app.delete('/api/clients/:id', (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.get('/api/bookings', (req, res) => {
    const { start_date, end_date } = req.query;
    const query = `
        SELECT b.*, c.name as client_name, f.name as facility_name 
        FROM bookings b
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN facilities f ON b.facility_id = f.id
        WHERE b.start_time BETWEEN ? AND ?
        ORDER BY b.start_time
    `;
    db.all(query, [start_date, end_date], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/bookings', (req, res) => {
    const { client_id, facility_id, start_time, end_time } = req.body;
    db.run('INSERT INTO bookings (client_id, facility_id, start_time, end_time) VALUES (?, ?, ?, ?)',
        [client_id, facility_id, start_time, end_time],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.delete('/api/bookings/:id', (req, res) => {
    db.run('DELETE FROM bookings WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.put('/api/bookings/:id', (req, res) => {
    const { client_id, facility_id, start_time, end_time } = req.body;
    db.run(
        'UPDATE bookings SET client_id = ?, facility_id = ?, start_time = ?, end_time = ? WHERE id = ?',
        [client_id, facility_id, start_time, end_time, req.params.id],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

app.get('/api/schedule', (req, res) => {
    const { date, facility_id } = req.query;
    let query = `
        SELECT s.*, f.name as facility_name 
        FROM schedule s
        LEFT JOIN facilities f ON s.facility_id = f.id
        WHERE 1=1
    `;
    const params = [];
    if (date) {
        query += ' AND s.date = ?';
        params.push(date);
    }
    if (facility_id) {
        query += ' AND s.facility_id = ?';
        params.push(facility_id);
    }
    query += ' ORDER BY s.date, s.start_time';
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/schedule', (req, res) => {
    const { facility_id, date, start_time, end_time, activity_name, trainer } = req.body;
    db.run('INSERT INTO schedule (facility_id, date, start_time, end_time, activity_name, trainer) VALUES (?, ?, ?, ?, ?, ?)',
        [facility_id, date, start_time, end_time, activity_name, trainer],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.get('/api/schedule/:id', (req, res) => {
    db.get(
        `SELECT s.*, f.name as facility_name 
         FROM schedule s
         LEFT JOIN facilities f ON s.facility_id = f.id
         WHERE s.id = ?`,
        [req.params.id],
        (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (!row) {
                res.status(404).json({ error: 'Schedule not found' });
                return;
            }
            res.json(row);
        }
    );
});

app.delete('/api/schedule/:id', (req, res) => {
    db.run('DELETE FROM schedule WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.put('/api/schedule/:id', (req, res) => {
    const { facility_id, date, start_time, end_time, activity_name, trainer } = req.body;
    db.run(
        'UPDATE schedule SET facility_id = ?, date = ?, start_time = ?, end_time = ?, activity_name = ?, trainer = ? WHERE id = ?',
        [facility_id, date, start_time, end_time, activity_name, trainer, req.params.id],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

app.get('/api/payments', (req, res) => {
    const query = `
        SELECT p.*, c.name as client_name, m.name as membership_name 
        FROM payments p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN memberships m ON p.membership_id = m.id
        ORDER BY p.payment_date DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/payments', (req, res) => {
    const { client_id, membership_id, amount } = req.body;
    db.run('INSERT INTO payments (client_id, membership_id, amount) VALUES (?, ?, ?)',
        [client_id, membership_id, amount],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.get('/api/memberships', (req, res) => {
    db.all('SELECT * FROM memberships ORDER BY name', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/memberships', (req, res) => {
    const { name, duration, price, description } = req.body;
    db.run('INSERT INTO memberships (name, duration, price, description) VALUES (?, ?, ?, ?)',
        [name, duration, price, description],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.get('/api/statistics', (req, res) => {
    const { start_date, end_date } = req.query;
    const facility_id = req.query.facility_id;
    const query = `
        SELECT 
            f.name as facility_name,
            f.id as facility_id,
            COUNT(*) as total_bookings,
            COUNT(DISTINCT b.client_id) as unique_clients
        FROM bookings b
        LEFT JOIN facilities f ON b.facility_id = f.id
        WHERE b.start_time BETWEEN ? AND ?
        ${facility_id ? 'AND b.facility_id = ?' : ''}
        GROUP BY f.id, f.name
        ORDER BY f.name
    `;
    const params = [start_date, end_date];
    if (facility_id) {
        params.push(facility_id);
    }
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Statistics query result:', rows);
        res.json(rows);
    });
});

app.get('/api/facilities', (req, res) => {
    db.all('SELECT * FROM facilities ORDER BY name', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 
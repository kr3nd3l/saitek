const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const moment = require('moment');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');

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

// Хранилище для расписаний отчетов
const reportSchedules = new Map();

// Конфигурация почтового сервера
const transporter = nodemailer.createTransport({
    host: 'smtp.example.com', // Замените на реальный SMTP сервер
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@example.com', // Замените на реальный email
        pass: 'your-password' // Замените на реальный пароль
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
            description TEXT,
            facility_id INTEGER,
            FOREIGN KEY (facility_id) REFERENCES facilities (id)
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


        db.all("PRAGMA table_info(memberships);", (err, rows) => {
            if (err) {
                console.error("Error checking memberships table info:", err);
                return;
            }
            const hasFacilityId = rows.some(row => row.name === 'facility_id');
            if (!hasFacilityId) {
                db.run(`ALTER TABLE memberships ADD COLUMN facility_id INTEGER;`, (alterErr) => {
                    if (alterErr) {
                        console.error("Error adding facility_id to memberships table:", alterErr);
                    } else {
                        console.log("Added facility_id column to memberships table.");
                    }
                });
            }
        });


        db.all("PRAGMA table_info(schedule);", (err, rows) => {
            if (err) {
                console.error("Error checking schedule table info:", err);
                return;
            }
            const hasClientId = rows.some(row => row.name === 'client_id');
            if (!hasClientId) {
                db.run(`ALTER TABLE schedule ADD COLUMN client_id INTEGER;`, (alterErr) => {
                    if (alterErr) {
                        console.error("Error adding client_id to schedule table:", alterErr);
                    } else {
                        console.log("Added client_id column to schedule table.");

                    }
                });
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

    if (!client_id || !facility_id || !start_time || !end_time) {
        return res.status(400).json({ error: 'Все поля обязательны для заполнения.' });
    }

    const bookingStartTime = moment(start_time);


    db.get(`
        SELECT m.facility_id, p.payment_date, m.duration
        FROM payments p
        JOIN memberships m ON p.membership_id = m.id
        WHERE p.client_id = ?
        ORDER BY p.payment_date DESC
        LIMIT 1
    `, [client_id], (err, row) => {
        if (err) {
            console.error('Error checking client membership:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(400).json({ error: 'Клиент не имеет активного абонемента.' });
        }

        const paymentDate = moment(row.payment_date);
        const membershipEndDate = paymentDate.add(row.duration, 'months');

        if (bookingStartTime.isAfter(membershipEndDate)) {
            return res.status(400).json({ error: 'Срок действия абонемента истёк.' });
        }

        if (row.facility_id && row.facility_id !== parseInt(facility_id)) {
            return res.status(400).json({ error: 'Зал не соответствует залу в абонементе клиента.' });
        }


        db.get(
            'SELECT COUNT(*) as count FROM bookings WHERE facility_id = ? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?)) ',
            [facility_id, end_time, start_time, end_time, start_time],
            (err, existingBooking) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                if (existingBooking.count > 0) {
                    res.status(400).json({ error: 'Выбранное время уже занято.' });
                    return;
                }

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
        SELECT s.*, f.name as facility_name, c.name as client_name 
        FROM schedule s
        LEFT JOIN facilities f ON s.facility_id = f.id
        LEFT JOIN clients c ON s.client_id = c.id
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
    const { client_id, facility_id, date, start_time, end_time, activity_name, trainer } = req.body;

    if (!client_id || !facility_id || !date || !start_time || !end_time || !activity_name || !trainer) {
        return res.status(400).json({ error: 'Все поля обязательны для заполнения.' });
    }

    const scheduleStartTime = moment(`${date}T${start_time}`);
    const scheduleEndTime = moment(`${date}T${end_time}`);


    db.get(`
        SELECT m.facility_id, p.payment_date, m.duration
        FROM payments p
        JOIN memberships m ON p.membership_id = m.id
        WHERE p.client_id = ?
        ORDER BY p.payment_date DESC
        LIMIT 1
    `, [client_id], (err, row) => {
        if (err) {
            console.error('Error checking client membership for schedule:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(400).json({ error: 'Клиент не имеет активного абонемента для добавления занятия.' });
        }

        const paymentDate = moment(row.payment_date);
        const membershipEndDate = paymentDate.add(row.duration, 'months');

        if (scheduleStartTime.isAfter(membershipEndDate)) {
            return res.status(400).json({ error: 'Срок действия абонемента клиента истёк.' });
        }

        if (row.facility_id && row.facility_id !== parseInt(facility_id)) {
            return res.status(400).json({ error: 'Зал для занятия не соответствует залу в абонементе клиента.' });
        }


        db.get(
            'SELECT COUNT(*) as count FROM schedule WHERE facility_id = ? AND date = ? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?)) ',
            [facility_id, date, end_time, start_time, end_time, start_time],
            (err, existingSchedule) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                if (existingSchedule.count > 0) {
                    res.status(400).json({ error: 'Выбранное время уже занято для данного зала.' });
                    return;
                }


                db.run('INSERT INTO schedule (client_id, facility_id, date, start_time, end_time, activity_name, trainer) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [client_id, facility_id, date, start_time, end_time, activity_name, trainer],
                    function(err) {
                        if (err) {
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        res.json({ id: this.lastID });
                    });
            }
        );
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
        SELECT p.*, c.name as client_name, m.name as membership_name, m.duration as membership_duration 
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

app.delete('/api/payments/:id', (req, res) => {
    db.run('DELETE FROM payments WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ success: true });
    });
});

app.get('/api/memberships', (req, res) => {
    const query = `
        SELECT m.*, f.name as facility_name
        FROM memberships m
        LEFT JOIN facilities f ON m.facility_id = f.id
        ORDER BY m.name
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/memberships', (req, res) => {
    const { name, duration, price, description, facility_id } = req.body;
    db.run('INSERT INTO memberships (name, duration, price, description, facility_id) VALUES (?, ?, ?, ?, ?)',
        [name, duration, price, description, facility_id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        });
});

app.delete('/api/memberships/:id', (req, res) => {
    const membershipId = req.params.id;
    db.get('SELECT COUNT(*) as count FROM payments WHERE membership_id = ?', [membershipId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (row.count > 0) {
            res.status(400).json({ error: 'Нельзя удалить абонемент, пока есть связанные оплаты.' });
            return;
        }
        db.run('DELETE FROM memberships WHERE id = ?', [membershipId], (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        });
    });
});

app.get('/api/statistics', (req, res) => {
    const { start_date, end_date } = req.query;
    const facility_id = req.query.facility_id;
    if (facility_id) {

        db.get('SELECT * FROM facilities WHERE id = ?', [facility_id], (err, facility) => {
            if (err || !facility) {
                res.status(500).json({ error: 'Зал не найден' });
                return;
            }

            db.get(`
                SELECT COUNT(*) as total_bookings, COUNT(DISTINCT client_id) as unique_clients
                FROM bookings
                WHERE facility_id = ? AND start_time BETWEEN ? AND ?
            `, [facility_id, start_date, end_date], (err2, bookingStats) => {
                if (err2) {
                    res.status(500).json({ error: err2.message });
                    return;
                }

                db.get(`
                    SELECT COUNT(p.id) as memberships_sold, COALESCE(SUM(p.amount),0) as memberships_total
                    FROM payments p
                    LEFT JOIN memberships m ON p.membership_id = m.id
                    WHERE m.facility_id = ? AND p.payment_date BETWEEN ? AND ?
                `, [facility_id, start_date, end_date], (err3, membershipStats) => {
                    if (err3) {
                        res.status(500).json({ error: err3.message });
                        return;
                    }
                    res.json([
                        {
                            facility_name: facility.name,
                            facility_id: facility.id,
                            total_bookings: bookingStats.total_bookings,
                            unique_clients: bookingStats.unique_clients,
                            memberships_sold: membershipStats.memberships_sold,
                            memberships_total: membershipStats.memberships_total
                        }
                    ]);
                });
            });
        });
        return;
    }

    const query = `
        SELECT 
            f.name as facility_name,
            f.id as facility_id,
            COUNT(*) as total_bookings,
            COUNT(DISTINCT b.client_id) as unique_clients
        FROM bookings b
        LEFT JOIN facilities f ON b.facility_id = f.id
        WHERE b.start_time BETWEEN ? AND ?
        GROUP BY f.id, f.name
        ORDER BY f.name
    `;
    const params = [start_date, end_date];
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        const statsWithMemberships = [];
        let pending = rows.length;
        if (pending === 0) return res.json([]);
        rows.forEach(row => {
            let membershipQuery = `
                SELECT COUNT(p.id) as memberships_sold, COALESCE(SUM(p.amount),0) as memberships_total
                FROM payments p
                LEFT JOIN memberships m ON p.membership_id = m.id
                WHERE m.id IS NOT NULL AND m.name IS NOT NULL
                AND p.payment_date BETWEEN ? AND ?
                AND m.facility_id = ?
            `;
            const membershipParams = [start_date, end_date, row.facility_id];
            db.get(membershipQuery, membershipParams, (err2, membershipStats) => {
                row.memberships_sold = membershipStats ? membershipStats.memberships_sold : 0;
                row.memberships_total = membershipStats ? membershipStats.memberships_total : 0;
                statsWithMemberships.push(row);
                pending--;
                if (pending === 0) {
                    res.json(statsWithMemberships);
                }
            });
        });
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

app.get('/api/facilities/:id', (req, res) => {
    db.get('SELECT * FROM facilities WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Зал не найден.' });
            return;
        }
        res.json(row);
    });
});

app.get('/api/clients/:id/active-membership', (req, res) => {
    db.get(`
        SELECT m.facility_id, p.payment_date, m.duration
        FROM payments p
        JOIN memberships m ON p.membership_id = m.id
        WHERE p.client_id = ?
        ORDER BY p.payment_date DESC
        LIMIT 1
    `, [req.params.id], (err, row) => {
        if (err) {
            console.error('Error checking client membership:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(400).json({ error: 'Клиент не имеет активного абонемента.' });
        }

        const paymentDate = moment(row.payment_date);
        const membershipEndDate = paymentDate.add(row.duration, 'months');

        res.json({
            facility_id: row.facility_id,
            payment_date: row.payment_date,
            membership_end_date: membershipEndDate.format('YYYY-MM-DD')
        });
    });
});

app.get('/api/payments/download-csv', (req, res) => {
    const query = `
        SELECT p.payment_date, c.name as client_name, m.name as membership_name, m.duration as membership_duration, p.amount
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

        if (rows.length === 0) {
            return res.status(204).send(); 
        }


        const headers = ['Дата оплаты', 'Клиент', 'Абонемент', 'Длительность (месяцев)', 'Сумма'];
        let csv = '\ufeff' + headers.join(',') + '\n';

        rows.forEach(row => {
            const paymentDate = moment(row.payment_date).format('YYYY-MM-DD');
            const clientName = row.client_name || '';
            const membershipName = row.membership_name || '';
            const membershipDuration = row.membership_duration || '';
            const amount = row.amount;

            csv += `"${paymentDate}","${clientName}","${membershipName}","${membershipDuration}","${amount}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
        res.send(csv);
    });
});

app.post('/api/reports/generate', async (req, res) => {
    const { type, startDate, endDate, format } = req.body;
    
    try {
        let reportData;
        
        switch (type) {
            case 'attendance':
                reportData = await generateAttendanceReport(startDate, endDate);
                break;
            case 'financial':
                reportData = await generateFinancialReport(startDate, endDate);
                break;
            case 'occupancy':
                reportData = await generateOccupancyReport(startDate, endDate);
                break;
            default:
                throw new Error('Неизвестный тип отчета');
        }

        if (format === 'pdf') {
            const pdfBuffer = await generatePDF(reportData, type);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${startDate}.pdf`);
            res.send(pdfBuffer);
        } else if (format === 'excel') {
            const excelBuffer = await generateExcel(reportData, type);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${startDate}.xlsx`);
            res.send(excelBuffer);
        } else {
            res.json(reportData);
        }
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/reports/schedule', (req, res) => {
    const { type, schedule: scheduleType, email, format } = req.body;
    
    try {
        const jobId = `${type}-${Date.now()}`;
        let cronPattern;
        
        switch (scheduleType) {
            case 'daily':
                cronPattern = '0 0 * * *'; // Каждый день в полночь
                break;
            case 'weekly':
                cronPattern = '0 0 * * 1'; // Каждый понедельник
                break;
            case 'monthly':
                cronPattern = '0 0 1 * *'; // Первый день каждого месяца
                break;
            default:
                throw new Error('Неверный тип расписания');
        }

        const job = schedule.scheduleJob(cronPattern, async () => {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            try {
                let reportData = await generateReport(type, startDate, endDate);
                let attachment;
                
                if (format === 'pdf') {
                    attachment = await generatePDF(reportData, type);
                } else {
                    attachment = await generateExcel(reportData, type);
                }

                await transporter.sendMail({
                    from: 'your-email@example.com',
                    to: email,
                    subject: `Автоматический отчет: ${type}`,
                    text: 'Во вложении находится автоматически сгенерированный отчет.',
                    attachments: [{
                        filename: `report-${type}-${startDate}.${format}`,
                        content: attachment
                    }]
                });
            } catch (error) {
                console.error('Error in scheduled report generation:', error);
            }
        });

        reportSchedules.set(jobId, job);
        
        res.json({ 
            success: true, 
            message: 'Расписание отчета создано',
            scheduleId: jobId 
        });
    } catch (error) {
        console.error('Error scheduling report:', error);
        res.status(500).json({ error: error.message });
    }
});

async function generateAttendanceReport(startDate, endDate) {
    const query = `
        SELECT 
            b.start_time,
            c.name as client_name,
            f.name as facility_name,
            COUNT(*) as visit_count
        FROM bookings b
        LEFT JOIN clients c ON b.client_id = c.id
        LEFT JOIN facilities f ON b.facility_id = f.id
        WHERE b.start_time BETWEEN ? AND ?
        GROUP BY c.id, f.id
        ORDER BY c.name, f.name
    `;
    
    return new Promise((resolve, reject) => {
        db.all(query, [startDate, endDate], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function generateFinancialReport(startDate, endDate) {
    const query = `
        SELECT 
            p.payment_date,
            c.name as client_name,
            m.name as membership_name,
            p.amount,
            f.name as facility_name
        FROM payments p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN memberships m ON p.membership_id = m.id
        LEFT JOIN facilities f ON m.facility_id = f.id
        WHERE p.payment_date BETWEEN ? AND ?
        ORDER BY p.payment_date DESC
    `;
    
    return new Promise((resolve, reject) => {
        db.all(query, [startDate, endDate], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function generateOccupancyReport(startDate, endDate) {
    const query = `
        SELECT 
            f.name as facility_name,
            COUNT(b.id) as total_bookings,
            COUNT(DISTINCT b.client_id) as unique_clients,
            f.capacity,
            ROUND(CAST(COUNT(b.id) AS FLOAT) / (julianday(?) - julianday(?)) * 100, 2) as occupancy_rate
        FROM facilities f
        LEFT JOIN bookings b ON f.id = b.facility_id
        AND b.start_time BETWEEN ? AND ?
        GROUP BY f.id
        ORDER BY f.name
    `;
    
    return new Promise((resolve, reject) => {
        db.all(query, [endDate, startDate, startDate, endDate], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function generatePDF(data, type) {
    return new Promise((resolve) => {
        const doc = new PDFDocument();
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        doc.fontSize(16).text(`Отчет: ${type}`, { align: 'center' });
        doc.moveDown();

        if (Array.isArray(data)) {
            data.forEach(row => {
                doc.fontSize(12).text(Object.entries(row)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ')
                );
                doc.moveDown();
            });
        }

        doc.end();
    });
}

async function generateExcel(data, type) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(type);

    if (Array.isArray(data) && data.length > 0) {
        // Заголовки
        worksheet.columns = Object.keys(data[0]).map(key => ({
            header: key,
            key: key,
            width: 20
        }));

        // Данные
        worksheet.addRows(data);
    }

    return await workbook.xlsx.writeBuffer();
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 
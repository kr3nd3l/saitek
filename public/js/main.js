document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.main-nav a');
    const pages = document.querySelectorAll('.page');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.getAttribute('data-page');
            
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(`${targetPage}-page`).classList.add('active');
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    const API_BASE_URL = 'http://localhost:3000/api';

    async function fetchData(endpoint) {
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching data:', error);
            return null;
        }
    }

    async function postData(endpoint, data) {
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });
            return await response.json();
        } catch (error) {
            console.error('Error posting data:', error);
            return null;
        }
    }

    const calendarDate = document.getElementById('calendar-date');
    const facilitySelect = document.getElementById('facility-select');
    const timeSlots = document.getElementById('time-slots');
    const bookingForm = document.getElementById('booking-form');

    flatpickr('.date-picker', {
        locale: 'ru',
        dateFormat: 'Y-m-d',
        onChange: function(selectedDates) {
            loadBookings(selectedDates[0]);
        }
    });

    async function loadBookings(date) {
        const facilityId = facilitySelect.value;
        const startDate = date.toISOString().split('T')[0];
        const endDate = startDate;

        const bookings = await fetchData(`bookings?start_date=${startDate}&end_date=${endDate}`);
        if (!bookings) return;

        displayTimeSlots(bookings, facilityId);
    }

    function displayTimeSlots(bookings, facilityId) {
        timeSlots.innerHTML = '';
        const hours = Array.from({length: 24}, (_, i) => i);
        
        hours.forEach(hour => {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            const time = `${hour.toString().padStart(2, '0')}:00`;
            
            const isBooked = bookings.some(booking => {
                const bookingHour = new Date(booking.start_time).getHours();
                return bookingHour === hour && 
                       (!facilityId || booking.facility_id === parseInt(facilityId));
            });

            slot.classList.add(isBooked ? 'booked' : 'available');
            slot.textContent = time;
            
            if (!isBooked) {
                slot.addEventListener('click', () => showBookingForm(hour));
            }

            timeSlots.appendChild(slot);
        });
    }

    function showBookingForm(hour) {
        const form = document.getElementById('new-booking');
        const date = calendarDate.value;
        const startTime = `${date}T${hour.toString().padStart(2, '0')}:00`;
        const endTime = `${date}T${(hour + 1).toString().padStart(2, '0')}:00`;

        form.querySelector('[name="start_time"]').value = startTime;
        form.querySelector('[name="end_time"]').value = endTime;

        bookingForm.classList.add('active');
    }

    const clientsTable = document.getElementById('clients-table').querySelector('tbody');
    const clientForm = document.getElementById('client-form');
    const addClientBtn = document.getElementById('add-client-btn');
    let editingClientId = null;

    async function loadClients() {
        const clients = await fetchData('clients');
        if (!clients) return;

        clientsTable.innerHTML = '';
        clients.forEach(client => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${client.name}</td>
                <td>${client.phone || '-'}</td>
                <td>${client.email || '-'}</td>
                <td>
                    <button class="edit-btn" data-id="${client.id}">Редактировать</button>
                    <button class="delete-btn" data-id="${client.id}">Удалить</button>
                </td>
            `;
            clientsTable.appendChild(row);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => editClient(btn.dataset.id));
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteClient(btn.dataset.id));
        });
    }

    async function editClient(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/clients/${id}`);
            if (!response.ok) {
                throw new Error('Failed to fetch client data');
            }
            const client = await response.json();
            
            editingClientId = id;
            const form = document.getElementById('new-client');
            form.querySelector('[name="name"]').value = client.name || '';
            form.querySelector('[name="phone"]').value = client.phone || '';
            form.querySelector('[name="email"]').value = client.email || '';

            const formTitle = form.closest('.modal-content').querySelector('h3');
            formTitle.textContent = 'Редактировать клиента';
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.textContent = 'Сохранить изменения';

            clientForm.classList.add('active');
        } catch (error) {
            console.error('Error fetching client data:', error);
            alert('Ошибка при загрузке данных клиента');
        }
    }

    async function deleteClient(id) {
        if (!confirm('Вы уверены, что хотите удалить этого клиента?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/clients/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                loadClients();
            } else {
                alert('Ошибка при удалении клиента');
            }
        } catch (error) {
            console.error('Error deleting client:', error);
            alert('Ошибка при удалении клиента');
        }
    }

    addClientBtn.addEventListener('click', () => {
        editingClientId = null;
        const form = document.getElementById('new-client');
        form.reset();
        
        const formTitle = form.closest('.modal-content').querySelector('h3');
        formTitle.textContent = 'Добавить клиента';
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Сохранить';
        
        clientForm.classList.add('active');
    });

    document.getElementById('new-client').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        try {
            let response;
            if (editingClientId) {
                response = await fetch(`${API_BASE_URL}/clients/${editingClientId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
            } else {
                response = await fetch(`${API_BASE_URL}/clients`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
            }
            
            if (!response.ok) {
                throw new Error('Failed to save client');
            }

            e.target.reset();
            clientForm.classList.remove('active');
            
            await loadClients();
            
            alert(editingClientId ? 'Клиент успешно обновлен' : 'Клиент успешно добавлен');
            

            editingClientId = null;
        } catch (error) {
            console.error('Error saving client:', error);
            alert('Ошибка при сохранении клиента');
        }
    });

    const scheduleTable = document.getElementById('schedule-table').querySelector('tbody');
    const scheduleForm = document.getElementById('schedule-form');
    const addScheduleBtn = document.getElementById('add-schedule-btn');

    const activities = [
        'Йога',
        'Плавание',
        'Силовая тренировка',
        'Кардио',
        'Пилатес'
    ];
    const trainers = [
        'Иван Иванов',
        'Мария Петрова',
        'Алексей Смирнов',
        'Ольга Кузнецова'
    ];

    function populateSelect(select, items, placeholder) {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            option.textContent = item;
            select.appendChild(option);
        });
    }

    function populateScheduleFormDropdowns() {
        const activitySelect = document.getElementById('activity-select');
        const trainerSelect = document.getElementById('trainer-select');
        if (activitySelect) populateSelect(activitySelect, activities, 'Выберите занятие');
        if (trainerSelect) populateSelect(trainerSelect, trainers, 'Выберите тренера');
    }

    async function loadSchedule() {
        const date = document.getElementById('schedule-date').value;
        const facilityId = document.getElementById('schedule-facility').value;

        let params = [];
        if (date) params.push(`date=${date}`);
        if (facilityId) params.push(`facility_id=${facilityId}`);
        const query = params.length ? '?' + params.join('&') : '';

        const schedule = await fetchData('schedule' + query);
        if (!schedule) return;

        scheduleTable.innerHTML = '';
        schedule.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.start_time} - ${item.end_time}</td>
                <td>${item.activity_name}</td>
                <td>${item.facility_name}</td>
                <td>${item.trainer || '-'}</td>
                <td>
                    <button onclick="editSchedule(${item.id})">Редактировать</button>
                    <button onclick="deleteSchedule(${item.id})">Удалить</button>
                </td>
            `;
            scheduleTable.appendChild(row);
        });
    }

    document.getElementById('schedule-date').addEventListener('change', loadSchedule);
    document.getElementById('schedule-facility').addEventListener('change', loadSchedule);

    addScheduleBtn.addEventListener('click', () => {
        editingScheduleId = null;
        document.getElementById('new-schedule').reset();
        scheduleForm.classList.add('active');
    });

    let editingScheduleId = null;

    async function deleteSchedule(id) {
        if (!confirm('Вы уверены, что хотите удалить это занятие?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/schedule/${id}`, { method: 'DELETE' });
            if (response.ok) {
                await loadSchedule();
            } else {
                alert('Ошибка при удалении занятия');
            }
        } catch (error) {
            alert('Ошибка при удалении занятия');
        }
    }

    async function editSchedule(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/schedule/${id}`);
            if (!response.ok) throw new Error();
            const item = await response.json();

            editingScheduleId = id;
            const form = document.getElementById('new-schedule');
            form.querySelector('[name="facility_id"]').value = item.facility_id;
            form.querySelector('[name="date"]').value = item.date;
            form.querySelector('[name="start_time"]').value = item.start_time;
            form.querySelector('[name="end_time"]').value = item.end_time;
            form.querySelector('[name="activity_name"]').value = item.activity_name;
            form.querySelector('[name="trainer"]').value = item.trainer;

            scheduleForm.classList.add('active');
        } catch {
            alert('Ошибка при загрузке занятия');
        }
    }

    document.getElementById('new-schedule').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        try {
            let response;
            if (editingScheduleId) {
                response = await fetch(`${API_BASE_URL}/schedule/${editingScheduleId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            } else {
                response = await fetch(`${API_BASE_URL}/schedule`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }
            if (!response.ok) throw new Error();
            scheduleForm.classList.remove('active');
            await loadSchedule();
            editingScheduleId = null;
            e.target.reset();
        } catch {
            alert('Ошибка при сохранении занятия');
        }
    });

    const paymentsTable = document.getElementById('payments-table').querySelector('tbody');
    const paymentForm = document.getElementById('payment-form');
    const addPaymentBtn = document.getElementById('add-payment-btn');

    async function loadPayments() {
        const payments = await fetchData('payments');
        if (!payments) return;

        paymentsTable.innerHTML = '';
        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>${payment.client_name}</td>
                <td>${payment.membership_name}</td>
                <td>${payment.amount}</td>
            `;
            paymentsTable.appendChild(row);
        });
    }

    addPaymentBtn.addEventListener('click', () => {
        paymentForm.classList.add('active');
    });

    document.getElementById('new-payment').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        await postData('payments', data);
        paymentForm.classList.remove('active');
        loadPayments();
    });

    const statsStartDate = document.getElementById('stats-start-date');
    const statsEndDate = document.getElementById('stats-end-date');
    const updateStatsBtn = document.getElementById('update-stats');
    const facilityStats = document.getElementById('facility-stats');
    const activeClients = document.getElementById('active-clients');

    async function loadStatistics() {
        const startDate = statsStartDate.value;
        const endDate = statsEndDate.value;
        
        const stats = await fetchData(`statistics?start_date=${startDate}&end_date=${endDate}`);
        if (!stats) return;

        facilityStats.innerHTML = '';
        stats.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stats-card';
            card.innerHTML = `
                <h4>${stat.facility_name}</h4>
                <p>Всего бронирований: ${stat.total_bookings}</p>
                <p>Уникальных клиентов: ${stat.unique_clients}</p>
            `;
            facilityStats.appendChild(card);
        });
    }

    updateStatsBtn.addEventListener('click', loadStatistics);

    async function loadFacilities() {
        const facilities = await fetchData('facilities');
        if (!facilities) return;

        const facilitySelects = [
            document.getElementById('facility-select'),
            document.querySelector('#new-booking select[name="facility_id"]'),
            document.getElementById('schedule-facility'),
            document.querySelector('#new-schedule select[name="facility_id"]')
        ].filter(Boolean);

        facilitySelects.forEach(select => {
            select.innerHTML = '<option value="">Выберите зал</option>';
            facilities.forEach(facility => {
                const option = document.createElement('option');
                option.value = facility.id;
                option.textContent = facility.name;
                select.appendChild(option);
            });
        });
    }

    async function populateMemberships() {
        const membershipSelects = [
            document.querySelector('#new-payment select[name="membership_id"]')
        ].filter(Boolean);

        const memberships = await fetchData('memberships');
        if (!memberships) return;

        membershipSelects.forEach(select => {
            select.innerHTML = '<option value="">Выберите абонемент</option>';
            memberships.forEach(membership => {
                const option = document.createElement('option');
                option.value = membership.id;
                option.textContent = `${membership.name} (${membership.price}₽)`;
                select.appendChild(option);
            });
        });
    }

    function initializePages() {
        loadFacilities();
        loadClients();
        loadSchedule();
        loadPayments();
        loadStatistics();
        populateScheduleFormDropdowns();
        populateBookingClients();
        populateMemberships();
    }

    document.querySelectorAll('.cancel').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').classList.remove('active');
        });
    });

    initializePages();
}); 
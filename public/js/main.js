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

        const clientSelect = form.querySelector('select[name="client_id"]');
        const facilitySelectForm = form.querySelector('select[name="facility_id"]');
        const submitButton = form.querySelector('button[type="submit"]');

        populateBookingFacilities(facilitySelectForm, null); 
        facilitySelectForm.classList.add('disabled-look'); 
        submitButton.disabled = true;

        populateBookingClients(clientSelect);

        clientSelect.removeEventListener('change', handleClientSelectChange);
        clientSelect.addEventListener('change', handleClientSelectChange);

        async function handleClientSelectChange() {
            const clientId = clientSelect.value;
            console.log('Client selected:', clientId);
            if (clientId) {
                try {
                    const membershipInfo = await fetchData(`clients/${clientId}/active-membership`);
                    console.log('Membership info for client:', membershipInfo);
                    if (membershipInfo && membershipInfo.facility_id) {
                        await populateBookingFacilities(facilitySelectForm, membershipInfo.facility_id);
                        facilitySelectForm.value = String(membershipInfo.facility_id);
                        console.log(`Facility select value after setting: ${facilitySelectForm.value}, selectedIndex: ${facilitySelectForm.selectedIndex}`);
                        console.log('Facility select HTML:', facilitySelectForm.outerHTML);
                        facilitySelectForm.classList.add('disabled-look'); 
                        submitButton.disabled = false; 
                    } else {

                        alert('У выбранного клиента нет активного абонемента или абонемент не привязан к залу.');
                        populateBookingFacilities(facilitySelectForm, null); 
                        facilitySelectForm.classList.add('disabled-look');
                        submitButton.disabled = true;
                    }
                } catch (error) {
                    console.error('Error fetching active membership:', error);
                    alert('Ошибка при загрузке информации об абонементе клиента.');
                    populateBookingFacilities(facilitySelectForm, null); 
                    facilitySelectForm.classList.add('disabled-look');
                    submitButton.disabled = true;
                }
            } else {
                populateBookingFacilities(facilitySelectForm, null); 
                facilitySelectForm.classList.add('disabled-look');
                submitButton.disabled = true;
            }
        }

        bookingForm.classList.add('active');
    }

    async function deleteBooking(id) {
        if (!confirm('Вы уверены, что хотите отменить это бронирование?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/bookings/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                const currentDate = calendarDate.value ? new Date(calendarDate.value) : new Date();
                await loadBookings(currentDate);
            } else {
                alert('Ошибка при отмене бронирования');
            }
        } catch (error) {
            console.error('Error deleting booking:', error);
            alert('Ошибка при отмене бронирования');
        }
    }

    document.getElementById('new-booking').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        let response = await postData('bookings', { client_id: data.client_id, facility_id: data.facility_id, start_time: data.start_time, end_time: data.end_time });
        
        if (response && !response.error) {
            bookingForm.classList.remove('active');
            const currentDate = calendarDate.value ? new Date(calendarDate.value) : new Date();
            await loadBookings(currentDate);
            e.target.reset();
            console.log('Attempting to reload bookings modal.', bookingsModal.classList.contains('active'));
            if (bookingsModal.classList.contains('active')) {
                await loadAndShowBookingsModal();
            }
        } else {
            const errorData = response && response.error ? response : { error: 'Неизвестная ошибка при обработке абонемента.' };
            alert(`Ошибка: ${errorData.error}`);
        }
    });

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
        
        const name = data.name.trim();
        const phone = data.phone.trim();
        const email = data.email.trim();
        

        document.querySelectorAll('.error-message').forEach(el => el.remove());
        document.querySelectorAll('.error-input').forEach(el => el.classList.remove('error-input'));
        
        let hasErrors = false;
        
        if (!name) {
            showError('name', 'Имя обязательно для заполнения');
            hasErrors = true;
        } else if (name.length < 2) {
            showError('name', 'Имя должно содержать минимум 2 символа');
            hasErrors = true;
        }
        
        if (phone) {
            const phoneRegex = /^\+?[0-9]{10,15}$/;
            if (!phoneRegex.test(phone)) {
                showError('phone', 'Введите корректный номер телефона');
                hasErrors = true;
            }
        }
        
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showError('email', 'Введите корректный email адрес');
                hasErrors = true;
            }
        }
        
        if (hasErrors) {
            return;
        }
        
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

    function showError(fieldName, message) {
        const input = document.querySelector(`[name="${fieldName}"]`);
        input.classList.add('error-input');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        input.parentNode.insertBefore(errorDiv, input.nextSibling);
    }

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


    const facilityActivitiesMap = {
        '1': ['Силовая тренировка', 'Кардио'],   
        '2': ['Плавание'],                   
        '3': ['Йога', 'Пилатес']             
    };

    function populateSelect(select, items, placeholder) {
        select.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = placeholder;
        select.appendChild(defaultOption);
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            select.appendChild(option);
        });
    }


    function populateActivitiesForFacility(facilityId, activitySelectElement) {
        const activitiesForSelectedFacility = facilityActivitiesMap[facilityId] || [];
        const formattedActivities = activitiesForSelectedFacility.map(activity => ({ id: activity, name: activity }));
        populateSelect(activitySelectElement, formattedActivities, 'Выберите занятие');
        if (activitiesForSelectedFacility.length === 0) {
            activitySelectElement.classList.add('disabled-look');
            activitySelectElement.disabled = true;
        } else {
            activitySelectElement.classList.remove('disabled-look');
            activitySelectElement.disabled = false;
        }
    }

    async function populateFacilitySelect(selectElement, placeholder) {
        const facilities = await fetchData('facilities');
        if (facilities) {
            populateSelect(selectElement, facilities, placeholder);
        }
    }

    function populateScheduleFormDropdowns() {
        const activitySelect = document.getElementById('activity-select');
        const trainerSelect = document.getElementById('trainer-select');


        const formattedTrainers = trainers.map(trainer => ({ id: trainer, name: trainer }));
        if (trainerSelect) populateSelect(trainerSelect, formattedTrainers, 'Выберите тренера');


        populateActivitiesForFacility(null, activitySelect); 
        activitySelect.classList.add('disabled-look');
        activitySelect.disabled = true;
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
            const formattedDate = new Date(item.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            row.innerHTML = `
                <td>${formattedDate} ${item.start_time} - ${item.end_time}</td>
                <td>${item.client_name || '-'}</td>
                <td>${item.activity_name}</td>
                <td>${item.facility_name}</td>
                <td>${item.trainer || '-'}</td>
                <td>
                    <button class="edit-schedule-btn" data-id="${item.id}">Редактировать</button>
                    <button class="delete-schedule-btn" data-id="${item.id}">Удалить</button>
                </td>
            `;
            scheduleTable.appendChild(row);
        });
        document.querySelectorAll('.edit-schedule-btn').forEach(btn => {
            btn.addEventListener('click', () => editSchedule(btn.dataset.id));
        });
        document.querySelectorAll('.delete-schedule-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteSchedule(btn.dataset.id));
        });
    }

    document.getElementById('schedule-date').addEventListener('change', loadSchedule);
    document.getElementById('schedule-facility').addEventListener('change', loadSchedule);

    addScheduleBtn.addEventListener('click', () => {
        editingScheduleId = null;
        const form = document.getElementById('new-schedule');
        form.reset();
        scheduleForm.classList.add('active');

        const scheduleClientSelect = form.querySelector('#schedule-client-select');
        const scheduleFacilityFormSelect = form.querySelector('#schedule-facility-form-select');
        const scheduleFormSubmitBtn = form.querySelector('button[type="submit"]');
        const activitySelect = form.querySelector('#activity-select');


        scheduleClientSelect.removeEventListener('change', handleScheduleClientSelectChange);
        scheduleClientSelect.addEventListener('change', handleScheduleClientSelectChange);


        scheduleFacilityFormSelect.removeEventListener('change', handleScheduleFacilitySelectChange);
        scheduleFacilityFormSelect.addEventListener('change', handleScheduleFacilitySelectChange);


        activitySelect.removeEventListener('change', handleScheduleActivitySelectChange);
        activitySelect.addEventListener('change', handleScheduleActivitySelectChange);


        populateBookingFacilities(scheduleFacilityFormSelect, null); 
        scheduleFacilityFormSelect.classList.add('disabled-look'); 
        scheduleFacilityFormSelect.value = ''; 

        populateActivitiesForFacility(null, activitySelect); 
        activitySelect.classList.add('disabled-look');
        activitySelect.disabled = true;

        scheduleFormSubmitBtn.disabled = true; 


        populateBookingClients(scheduleClientSelect);
    });

    async function handleScheduleClientSelectChange() {
        const form = document.getElementById('new-schedule');
        const scheduleClientSelect = form.querySelector('#schedule-client-select');
        const scheduleFacilityFormSelect = form.querySelector('#schedule-facility-form-select');
        const scheduleFormSubmitBtn = form.querySelector('button[type="submit"]');
        const activitySelect = form.querySelector('#activity-select');

        const clientId = scheduleClientSelect.value;
        console.log('Schedule client selected:', clientId);

        if (clientId) {
            try {
                const membershipInfo = await fetchData(`clients/${clientId}/active-membership`);
                console.log('Membership info for client (schedule):', membershipInfo);

                if (membershipInfo && membershipInfo.facility_id) {
                    await populateBookingFacilities(scheduleFacilityFormSelect, membershipInfo.facility_id); 
                    scheduleFacilityFormSelect.value = String(membershipInfo.facility_id); 
                    scheduleFacilityFormSelect.classList.remove('disabled-look'); 
                    scheduleFacilityFormSelect.disabled = false; 

                    populateActivitiesForFacility(scheduleFacilityFormSelect.value, activitySelect); 

                    console.log('handleScheduleClientSelectChange - Facility selected by membership:', scheduleFacilityFormSelect.value);
                    console.log('handleScheduleClientSelectChange - Activity select value (after populate):', activitySelect.value);
                    

                    handleScheduleActivitySelectChange();

                    console.log('handleScheduleClientSelectChange - Submit button disabled state:', scheduleFormSubmitBtn.disabled);
                } else {
                    alert('У выбранного клиента нет активного абонемента или абонемент не привязан к залу.');
                    populateBookingFacilities(scheduleFacilityFormSelect, null); 
                    scheduleFacilityFormSelect.classList.add('disabled-look');
                    scheduleFacilityFormSelect.disabled = true; 
                    scheduleFacilityFormSelect.value = '';

                    populateActivitiesForFacility(null, activitySelect);
                    activitySelect.classList.add('disabled-look');
                    activitySelect.disabled = true;

                    scheduleFormSubmitBtn.disabled = true;
                }
            } catch (error) {
                console.error('Error fetching active membership for schedule:', error);
                alert('Ошибка при загрузке информации об абонементе клиента.');
                populateBookingFacilities(scheduleFacilityFormSelect, null); 
                scheduleFacilityFormSelect.classList.add('disabled-look');
                scheduleFacilityFormSelect.disabled = true;
                scheduleFacilityFormSelect.value = '';

                populateActivitiesForFacility(null, activitySelect); 
                activitySelect.classList.add('disabled-look');
                activitySelect.disabled = true;

                scheduleFormSubmitBtn.disabled = true;
            }
        } else {

            populateBookingFacilities(scheduleFacilityFormSelect, null); 
            scheduleFacilityFormSelect.classList.add('disabled-look');
            scheduleFacilityFormSelect.disabled = true;
            scheduleFacilityFormSelect.value = '';

            populateActivitiesForFacility(null, activitySelect); 
            activitySelect.classList.add('disabled-look');
            activitySelect.disabled = true;

            scheduleFormSubmitBtn.disabled = true;
        }
    }

    function handleScheduleFacilitySelectChange() {
        const form = document.getElementById('new-schedule');
        const scheduleFacilityFormSelect = form.querySelector('#schedule-facility-form-select');
        const activitySelect = form.querySelector('#activity-select');
        const scheduleFormSubmitBtn = form.querySelector('button[type="submit"]');

        const selectedFacilityId = scheduleFacilityFormSelect.value;
        populateActivitiesForFacility(selectedFacilityId, activitySelect);

        console.log('handleScheduleFacilitySelectChange - Selected facility ID:', selectedFacilityId);
        console.log('handleScheduleFacilitySelectChange - Activity select value (after populate):', activitySelect.value);
        

        handleScheduleActivitySelectChange();

        console.log('handleScheduleFacilitySelectChange - Submit button disabled state:', scheduleFormSubmitBtn.disabled);
    }

    function handleScheduleActivitySelectChange() {
        const form = document.getElementById('new-schedule');
        const scheduleFacilityFormSelect = form.querySelector('#schedule-facility-form-select');
        const activitySelect = form.querySelector('#activity-select');
        const scheduleFormSubmitBtn = form.querySelector('button[type="submit"]');

        const selectedFacilityId = scheduleFacilityFormSelect.value;
        const selectedActivityValue = activitySelect.value;

        if (selectedFacilityId && selectedActivityValue) {
            scheduleFormSubmitBtn.disabled = false;
            console.log('handleScheduleActivitySelectChange - Submit button enabled.');
        } else {
            scheduleFormSubmitBtn.disabled = true;
            console.log('handleScheduleActivitySelectChange - Submit button disabled.');
        }
    }

    let editingScheduleId = null;

    async function deleteSchedule(id) {
        console.log(`Attempting to delete schedule item with ID: ${id}`);
        if (!confirm('Вы уверены, что хотите удалить это занятие?')) {
            console.log('Deletion cancelled by user.');
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/schedule/${id}`, { method: 'DELETE' });
            console.log('Delete schedule response:', response);
            if (response.ok) {
                console.log('Schedule item deleted successfully. Reloading schedule...');
                await loadSchedule();
            } else {
                const errorData = await response.json();
                console.error('Error deleting schedule item:', errorData);
                alert(`Ошибка при удалении занятия: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error('Network error during schedule deletion:', error);
            alert('Ошибка при удалении занятия: Проблема с сетью или сервером.');
        }
    }

    async function editSchedule(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/schedule/${id}`);
            if (!response.ok) throw new Error();
            const item = await response.json();

            editingScheduleId = id;
            const form = document.getElementById('new-schedule');
            const scheduleClientSelect = form.querySelector('#schedule-client-select');
            const scheduleFacilityFormSelect = form.querySelector('#schedule-facility-form-select');
            const activitySelect = form.querySelector('#activity-select');
            const trainerSelect = form.querySelector('#trainer-select');
            const scheduleFormSubmitBtn = form.querySelector('button[type="submit"]');


            await populateBookingClients(scheduleClientSelect); 
            scheduleClientSelect.value = String(item.client_id || ''); 


            await populateBookingFacilities(scheduleFacilityFormSelect, item.facility_id);
            scheduleFacilityFormSelect.value = String(item.facility_id);
            scheduleFacilityFormSelect.classList.remove('disabled-look');
            scheduleFacilityFormSelect.disabled = false;


            populateActivitiesForFacility(String(item.facility_id), activitySelect);
            activitySelect.value = item.activity_name; 


            const formattedTrainers = trainers.map(trainer => ({ id: trainer, name: trainer }));
            populateSelect(trainerSelect, formattedTrainers, 'Выберите тренера');
            trainerSelect.value = item.trainer;

            form.querySelector('[name="date"]').value = item.date;
            form.querySelector('[name="start_time"]').value = item.start_time;
            form.querySelector('[name="end_time"]').value = item.end_time;
            

            scheduleFormSubmitBtn.disabled = false;

            scheduleForm.classList.add('active');
        } catch (error) {
            console.error('Ошибка при загрузке занятия для редактирования:', error);
            alert('Ошибка при загрузке занятия');
        }
    }

    document.getElementById('new-schedule').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());


        data.client_id = document.getElementById('schedule-client-select').value;


        try {
            let response;
            if (editingScheduleId) {

                data.facility_id = document.getElementById('schedule-facility-form-select').value;
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
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Неизвестная ошибка');
            }
            scheduleForm.classList.remove('active');
            await loadSchedule();
            editingScheduleId = null;
            e.target.reset();
            alert('Занятие успешно сохранено!');
        } catch (error) {
            console.error('Ошибка при сохранении занятия:', error);
            alert(`Ошибка при сохранении занятия: ${error.message}`);
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
            let durationText = '-';
            const duration = Number(payment.membership_duration);
            if (duration) {
                if (duration % 12 === 0) {
                    const years = duration / 12;
                    durationText = years + ' ' + (years === 1 ? 'год' : (years < 5 ? 'года' : 'лет'));
                } else {
                    durationText = duration + ' месяцев';
                }
            }
            row.innerHTML = `
                <td>${new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>${payment.client_name}</td>
                <td>${payment.membership_name}</td>
                <td>${payment.amount}</td>
                <td>${durationText}</td>
                <td><button class="delete-payment-btn" data-id="${payment.id}">Удалить</button></td>
            `;
            paymentsTable.appendChild(row);
        });
        document.querySelectorAll('.delete-payment-btn').forEach(btn => {
            btn.addEventListener('click', () => deletePayment(btn.dataset.id));
        });
    }

    addPaymentBtn.addEventListener('click', () => {
        paymentForm.classList.add('active');
        populateMemberships();
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
    const statsFacilitySelect = document.getElementById('stats-facility-select');

    async function loadStatistics() {
        const startDate = statsStartDate.value;
        const endDate = statsEndDate.value;
        const facilityId = statsFacilitySelect.value;
        
        let statsUrl = `statistics?start_date=${startDate}&end_date=${endDate}`;
        if (facilityId) {
            statsUrl += `&facility_id=${facilityId}`;
        }
        const stats = await fetchData(statsUrl);
        if (!stats) return;

        let statsArr = Array.isArray(stats) ? stats : (stats ? [stats] : []);
        facilityStats.innerHTML = '';
        if (statsArr.length === 0) {
            facilityStats.innerHTML = '<p>Нет данных за указанный период.</p>';
            return;
        }
        statsArr.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stats-card';
            card.innerHTML = `
                <h4>${stat.facility_name || '-'}</h4>
                <p>Всего бронирований: ${stat.total_bookings != null ? stat.total_bookings : 0}</p>
                <p>Уникальных клиентов: ${stat.unique_clients != null ? stat.unique_clients : 0}</p>
                <p>Куплено абонементов: ${stat.memberships_sold != null ? stat.memberships_sold : 0}</p>
                <p>Сумма за абонементы: ${stat.memberships_total != null ? stat.memberships_total : 0}₽</p>
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
            document.querySelector('#new-schedule select[name="facility_id"]'),
            statsFacilitySelect
        ].filter(Boolean);

        facilitySelects.forEach(select => {
            select.innerHTML = '<option value="">Выберите зал</option>';
            facilities.forEach(facility => {
                const option = document.createElement('option');
                option.value = String(facility.id);
                option.textContent = facility.name;
                select.appendChild(option);
            });
        });
    }

    async function populateMemberships() {
        const membershipSelects = Array.from(document.querySelectorAll('select[name="membership_id"]'));
        const memberships = await fetchData('memberships');
        if (!memberships) return;
        membershipSelects.forEach(select => {
            select.innerHTML = '<option value="">Выберите абонемент</option>';
            memberships.forEach(membership => {
                const option = document.createElement('option');
                option.value = String(membership.id);
                option.textContent = `${membership.name} (${membership.duration} месяцев, ${membership.price.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 })})`;
                select.appendChild(option);
            });
        });
    }

    async function populateBookingClients(selectElement = null) {
        const clientSelects = selectElement ? [selectElement] : [
            document.querySelector('#new-booking select[name="client_id"]'),
            document.querySelector('#new-payment select[name="client_id"]')
        ].filter(Boolean);

        const clients = await fetchData('clients');
        if (!clients) return;

        clientSelects.forEach(select => {
            select.innerHTML = '<option value="">Выберите клиента</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = String(client.id);
                option.textContent = client.name;
                select.appendChild(option);
            });
        });
    }

    async function populateBookingFacilities(selectElement, selectedFacilityId = null) {

        while (selectElement.firstChild) {
            selectElement.removeChild(selectElement.firstChild);
        }

        if (selectedFacilityId) {

            const facility = await fetchData(`facilities/${selectedFacilityId}`);
            if (facility) {
                const option = document.createElement('option');
                option.value = String(facility.id);
                option.textContent = facility.name;
                option.selected = true; 
                selectElement.appendChild(option);
            } else {

                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = 'Зал не найден'; 
                selectElement.appendChild(defaultOption);
            }
        } else {

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Выберите зал';
            selectElement.appendChild(defaultOption);

            const facilities = await fetchData('facilities');
            if (facilities) {
                facilities.forEach(facility => {
                    const option = document.createElement('option');
                    option.value = String(facility.id);
                    option.textContent = facility.name;
                    selectElement.appendChild(option);
                });
            }
        }
    }

    function initializePages() {
        loadFacilities();
        loadClients();
        loadSchedule();
        loadPayments();
        loadStatistics();
        populateScheduleFormDropdowns();
        populateBookingClients(document.querySelector('#new-payment select[name="client_id"]')); 
        populateMemberships();

    }

    document.querySelectorAll('.cancel').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').classList.remove('active');
        });
    });

    facilitySelect.addEventListener('change', () => {
        if (calendarDate.value) {
            loadBookings(new Date(calendarDate.value));
        }
    });

    if (calendarDate.value) {
        loadBookings(new Date(calendarDate.value));
    }

    const viewBookingsBtn = document.getElementById('view-bookings-btn');
    const bookingsModal = document.getElementById('bookings-modal');
    const closeBookingsModal = document.getElementById('close-bookings-modal');
    const bookingsTableModal = document.querySelector('#bookings-table-modal tbody');

    viewBookingsBtn.addEventListener('click', async () => {
        await loadAndShowBookingsModal();
        bookingsModal.classList.add('active');
    });

    closeBookingsModal.addEventListener('click', () => {
        bookingsModal.classList.remove('active');
    });

    async function loadAndShowBookingsModal() {
        const bookings = await fetchData('bookings?start_date=1970-01-01&end_date=2100-12-31');
        const facilities = await fetchData('facilities');
        bookingsTableModal.innerHTML = '';
        if (!bookings || bookings.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="5" style="text-align:center; color:#888;">Нет бронирований</td>';
            bookingsTableModal.appendChild(row);
            return;
        }
        bookings.forEach(booking => {
            const row = document.createElement('tr');
            const startDate = new Date(booking.start_time);
            const endDate = new Date(booking.end_time);
            let facilityName = booking.facility_name || booking.facility || '-';
            if ((!facilityName || facilityName === '-') && facilities && booking.facility_id) {
                const found = facilities.find(f => f.id == booking.facility_id);
                if (found) facilityName = found.name;
            }
            row.innerHTML = `
                <td>${startDate.toLocaleDateString()}</td>
                <td>${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${booking.client_name || booking.client || '-'}</td>
                <td>${facilityName}</td>
                <td>
                    <button class="delete-booking-btn" data-id="${booking.id}">Удалить</button>
                </td>
            `;
            bookingsTableModal.appendChild(row);
        });
        document.querySelectorAll('.delete-booking-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Удалить это бронирование?')) {
                    await fetch(`${API_BASE_URL}/bookings/${btn.dataset.id}`, { method: 'DELETE' });
                    await loadAndShowBookingsModal();
                }
            });
        });
    }

    const membershipsTable = document.getElementById('memberships-table')?.querySelector('tbody');
    const membershipForm = document.getElementById('membership-form');
    const addMembershipBtn = document.getElementById('add-membership-btn');

    async function loadMemberships() {
        const memberships = await fetchData('memberships');
        if (!memberships) return;

        const membershipsTable = document.getElementById('memberships-table').querySelector('tbody');
        membershipsTable.innerHTML = '';

        memberships.forEach(membership => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${membership.name}</td>
                <td>${membership.duration} месяцев</td>
                <td>${membership.price.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 })}</td>
                <td>${membership.facility_name || '-'}</td>
                <td>
                    <button class="delete-membership-btn" data-id="${membership.id}">Удалить</button>
                </td>
            `;
            membershipsTable.appendChild(row);
        });

        document.querySelectorAll('.delete-membership-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteMembership(btn.dataset.id));
        });
    }

    async function deleteMembership(id) {
        if (!confirm('Вы уверены, что хотите удалить этот абонемент?')) return;
        console.log('Удаление абонемента с id:', id);
        try {
            const response = await fetch(`${API_BASE_URL}/memberships/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                loadMemberships();
            } else {
                const data = await response.json().catch(() => ({}));
                alert(data.error || 'Ошибка при удалении абонемента');
            }
        } catch (error) {
            console.error('Error deleting membership:', error);
            alert('Ошибка при удалении абонемента');
        }
    }

    addMembershipBtn.addEventListener('click', async () => {
        editingMembershipId = null;
        const form = document.getElementById('new-membership');
        form.reset();
        await populateFacilitySelect(form.querySelector('[name="facility_id"]'), 'Выберите зал');
        form.querySelector('[name="facility_id"]').value = ''; 

        const formTitle = form.closest('.modal-content').querySelector('h3');
        formTitle.textContent = 'Добавить абонемент';
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.textContent = 'Сохранить';
        
        membershipForm.classList.add('active');
    });

    document.getElementById('new-membership').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const name = data.name.trim();
        const duration = parseInt(data.duration);
        const price = parseFloat(data.price);
        const description = data.description ? data.description.trim() : null;
        const facility_id = data.facility_id ? parseInt(data.facility_id) : null;

        if (!name || isNaN(duration) || isNaN(price)) {
            alert('Пожалуйста, заполните все обязательные поля (Название, Длительность, Цена).');
            return;
        }

        let response = await postData('memberships', { name, duration, price, description, facility_id });
        
        if (response && !response.error) {
            membershipForm.classList.remove('active');
            loadMemberships();
            e.target.reset();
        } else {
            const errorData = response && response.error ? response : { error: 'Неизвестная ошибка при обработке абонемента.' };
            alert(`Ошибка: ${errorData.error}`);
        }
    });

    loadMemberships();

    initializePages();

    async function deletePayment(id) {
        if (!confirm('Вы уверены, что хотите удалить эту оплату?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/payments/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadPayments();
            } else {
                alert('Ошибка при удалении оплаты');
            }
        } catch (error) {
            alert('Ошибка при удалении оплаты');
        }
    }


    const downloadPaymentsCsvBtn = document.getElementById('download-payments-csv-btn');
    if (downloadPaymentsCsvBtn) {
        downloadPaymentsCsvBtn.addEventListener('click', () => {
            window.open('/api/payments/download-csv', '_blank');
        });
    }
}); 
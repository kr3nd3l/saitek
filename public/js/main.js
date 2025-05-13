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

    function initializePages() {
        const calendarPage = document.getElementById('calendar-page');

        const clientsPage = document.getElementById('clients-page');

        const schedulePage = document.getElementById('schedule-page');

        const paymentsPage = document.getElementById('payments-page');

        const statisticsPage = document.getElementById('statistics-page');

    }

    initializePages();
}); 
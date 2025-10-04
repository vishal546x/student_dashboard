import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- Firebase Config and Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyBBJHLe2yUYTvYywGS5pt0J1TRA71GI2cw",
    authDomain: "analytics-899d1.firebaseapp.com",
    projectId: "analytics-899d1",
    storageBucket: "analytics-899d1.firebasestorage.app",
    messagingSenderId: "398748085171",
    appId: "1:398748085171:web:8d674af6871c58ff25f9c6",
    measurementId: "G-4T9J8YKEG7"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let monthlyAttendanceChart = null;

// --- Authentication and User Data ---
const userData = JSON.parse(sessionStorage.getItem('loggedInUser'));
if (!userData || userData.role !== 'student') {
    window.location.href = 'login.html';
}
const { name, roll_number, dept, year, section } = userData;
const classId = `${dept}_${year}_${section}`;

// --- UI Display Functions ---

function displayStudentDetails() {
    document.getElementById('student-name').textContent = `Welcome, ${name}`;
    document.getElementById('detail-roll').textContent = roll_number;
    document.getElementById('detail-dept').textContent = dept;
    document.getElementById('detail-year').textContent = year;
    document.getElementById('detail-section').textContent = section;
    document.getElementById('modal-name').textContent = name;
    document.getElementById('modal-roll').textContent = roll_number;
    document.getElementById('modal-dept').textContent = dept;
    document.getElementById('modal-year').textContent = year;
    document.getElementById('modal-section').textContent = section;
}

async function fetchAndDisplayDailyAttendance(dateString) {
    const container = document.getElementById('attendance-status-container');
    container.innerHTML = '<p>Loading attendance...</p>';
    try {
        const subjectMap = {};
        const subjectDetailsRef = collection(db, `College/RMKEC/${dept}/${classId}/faculty_sub_details`);
        const subjectSnapshot = await getDocs(subjectDetailsRef);
        subjectSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.subject_code && data.subject_name) {
                subjectMap[data.subject_code] = data.subject_name;
            }
        });
        const docRef = doc(db, `College/RMKEC/${dept}/${classId}/attendance/${dateString}/students`, roll_number);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const attendanceData = docSnap.data();
            const uniquePeriods = new Map();
            for (const key in attendanceData) {
                const parts = key.split('_');
                if (parts.length >= 2) {
                    const periodNum = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(periodNum)) {
                        const subjectCode = parts.slice(0, -1).join('_');
                        const subjectName = subjectMap[subjectCode] || subjectCode;
                        const status = attendanceData[key];
                        const statusClass = status.toLowerCase().startsWith('present') ? 'present' : 'absent';
                        uniquePeriods.set(periodNum, { subjectName, statusClass });
                    }
                }
            }
            if (uniquePeriods.size === 0) {
                 container.innerHTML = '<p>No valid attendance records for this day.</p>';
                 return;
            }
            const sortedPeriods = Array.from(uniquePeriods.entries()).sort((a, b) => a[0] - b[0]);
            let content = sortedPeriods.map(([periodNum, periodData]) => `
                <div class="period ${periodData.statusClass}">
                    <strong>Period ${periodNum}</strong><br>
                    <span>${periodData.subjectName}</span>
                </div>
            `).join('');
            container.innerHTML = content;
        } else {
            container.innerHTML = '<p>No attendance record found for this date.</p>';
        }
    } catch (error) {
        console.error("Error fetching daily attendance:", error);
        container.innerHTML = '<p style="color: red;">Could not load daily attendance.</p>';
    }
}

async function calculateOverallSemesterAttendance() {
    let totalPeriodsAttended = 0;
    let totalPeriodsHeld = 0;
    try {
        const path = `College/RMKEC/${dept}/${classId}/attendance`;
        console.log("DEBUG (Overall): Fetching all days from path:", path);
        const attendanceCollectionRef = collection(db, path);
        const daysSnapshot = await getDocs(attendanceCollectionRef);
        console.log(`DEBUG (Overall): Found ${daysSnapshot.size} day(s) with records.`);
        if (daysSnapshot.empty) {
            document.getElementById('detail-overall-attendance').textContent = `0.00 %`;
            return;
        }
        const studentDocPromises = daysSnapshot.docs.map(dayDoc => 
            getDoc(doc(dayDoc.ref, 'students', roll_number))
        );
        const studentDocSnapshots = await Promise.all(studentDocPromises);
        studentDocSnapshots.forEach(studentDocSnap => {
            if (studentDocSnap.exists()) {
                const data = studentDocSnap.data();
                for (const key in data) {
                    if (key.includes('_') && !isNaN(parseInt(key.split('_').pop(), 10))) {
                        totalPeriodsHeld++;
                        if (data[key].toLowerCase().startsWith('present')) {
                            totalPeriodsAttended++;
                        }
                    }
                }
            }
        });
        console.log(`DEBUG (Overall): Total periods held: ${totalPeriodsHeld}`);
        console.log(`DEBUG (Overall): Total periods attended: ${totalPeriodsAttended}`);
        const overallPercentage = totalPeriodsHeld > 0 ? (totalPeriodsAttended / totalPeriodsHeld) * 100 : 0;
        document.getElementById('detail-overall-attendance').textContent = `${overallPercentage.toFixed(2)} %`;
    } catch (error) {
        console.error("Error calculating overall semester attendance:", error);
        document.getElementById('detail-overall-attendance').textContent = `Error`;
    }
}

async function calculateMonthlyPercentagesAndAlerts() {
    const selectedMonth = document.getElementById('monthSelect').value;
    const selectedYear = document.getElementById('yearSelect').value;
    
    const subjectMap = {};
    const subjectStats = {};
    const subjectDetailsRef = collection(db, `College/RMKEC/${dept}/${classId}/faculty_sub_details`);
    const subjectSnapshot = await getDocs(subjectDetailsRef);
    subjectSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.subject_code && data.subject_name) {
            subjectMap[data.subject_code] = data.subject_name;
            subjectStats[data.subject_code] = { present: 0, total: 0 };
        }
    });

    const daysInMonth = new Date(selectedYear, parseInt(selectedMonth) + 1, 0).getDate();
    const attendancePromises = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth, day);
        if (date.getDay() === 0) continue;
        const newDateString = `${selectedYear}-${String(parseInt(selectedMonth) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const docRef = doc(db, `College/RMKEC/${dept}/${classId}/attendance/${newDateString}/students`, roll_number);
        attendancePromises.push(getDoc(docRef));
    }
    const snapshots = await Promise.all(attendancePromises);
    let monthlyTotalAttended = 0;
    let monthlyTotalHeld = 0;
    snapshots.forEach(docSnap => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            for (const key in data) {
                const parts = key.split('_');
                if (parts.length >= 2 && !isNaN(parseInt(parts[parts.length - 1], 10))) {
                    const subjectCode = parts.slice(0, -1).join('_');
                    if (subjectStats[subjectCode]) {
                        subjectStats[subjectCode].total++;
                        monthlyTotalHeld++;
                        if (data[key].toLowerCase().startsWith('present')) {
                            subjectStats[subjectCode].present++;
                            monthlyTotalAttended++;
                        }
                    }
                }
            }
        }
    });
    
    const monthlyOverallPercentage = monthlyTotalHeld > 0 ? (monthlyTotalAttended / monthlyTotalHeld) * 100 : 0;
    const alertBox = document.getElementById('attendanceAlertBox');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');
    const alertBtn = document.getElementById('alert-action-btn');
    alertBox.style.display = 'none'; 
    
    if (new Date().getMonth() == selectedMonth && new Date().getFullYear() == selectedYear) {
        const advisorEmail = "hod-email@example.com"; 
        let mailtoLink = "";
        if (monthlyOverallPercentage < 75 && monthlyTotalHeld > 0) {
            alertBox.style.display = 'block';
            alertBox.className = 'card alert-card danger';
            alertTitle.textContent = "Urgent: Monthly Attendance Low";
            alertMessage.textContent = `Your attendance for this month is ${monthlyOverallPercentage.toFixed(2)}%, which is below the 75% requirement. You must notify your faculty advisor.`;
            let emailSubject = "Urgent - Low Attendance Notification";
            let emailBody = `Dear Advisor,\n\nThis is to inform you that my attendance for this month has dropped to ${monthlyOverallPercentage.toFixed(2)}%.\n\nName: ${name}\nRoll Number: ${roll_number}\n\nRegards.`;
            mailtoLink = `mailto:${advisorEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        } else if (monthlyOverallPercentage >= 75 && monthlyOverallPercentage < 80) {
            alertBox.style.display = 'block';
            alertBox.className = 'card alert-card warning';
            alertTitle.textContent = "Warning: Monthly Attendance Approaching Limit";
            alertMessage.textContent = `Your attendance is ${monthlyOverallPercentage.toFixed(2)}%. You are approaching the 75% limit. It is advised to notify your advisor.`;
            let emailSubject = "Warning - Low Attendance Notification";
            let emailBody = `Dear Advisor,\n\nThis is a notification that my attendance for this month is currently at ${monthlyOverallPercentage.toFixed(2)}%.\n\nName: ${name}\nRoll Number: ${roll_number}\n\nRegards.`;
            mailtoLink = `mailto:${advisorEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
        }
        if (mailtoLink) {
            alertBtn.setAttribute('href', mailtoLink);
        }
    }
    
    const container = document.getElementById('subject-attendance-container');
    const monthName = new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long' });
    let tableHTML = `<table class="subject-table"><thead><tr><th>Subject</th><th>Classes Attended</th><th>Total Classes</th><th>Percentage</th></tr></thead><tbody>`;
    let subjectsFound = false;
    for (const code in subjectStats) {
        const stats = subjectStats[code];
        if(stats.total > 0){ 
            subjectsFound = true;
            const subjectName = subjectMap[code] || code;
            const percentage = ((stats.present / stats.total) * 100).toFixed(2);
            tableHTML += `<tr><td>${subjectName}</td><td>${stats.present}</td><td>${stats.total}</td><td>${percentage} %</td></tr>`;
        }
    }
    if(!subjectsFound){
        container.innerHTML = `<p>No attendance data found for any subjects in ${monthName}.</p>`;
        return;
    }
    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}

async function fetchAndRenderMonthlyChart() {
    const selectedMonth = document.getElementById('monthSelect').value;
    const selectedYear = document.getElementById('yearSelect').value;

    const daysInMonth = new Date(selectedYear, parseInt(selectedMonth) + 1, 0).getDate();
    const labels = [];
    const presentData = [];
    const absentData = [];
    const attendancePromises = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth, day);
        if (date.getDay() === 0) continue;
        const newDateString = `${selectedYear}-${String(parseInt(selectedMonth) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        labels.push(date.getDate());
        const docRef = doc(db, `College/RMKEC/${dept}/${classId}/attendance/${newDateString}/students`, roll_number);
        attendancePromises.push(getDoc(docRef));
    }
    const snapshots = await Promise.all(attendancePromises);
    snapshots.forEach(docSnap => {
        let presentCount = 0;
        let absentCount = 0;
        if (docSnap.exists()) {
            const data = docSnap.data();
            Object.values(data).forEach(status => {
                if (typeof status === 'string') {
                    if (status.toLowerCase().startsWith('present')) presentCount++;
                    else if (status.toLowerCase().startsWith('absent')) absentCount++;
                }
            });
        }
        presentData.push(presentCount);
        absentData.push(absentCount);
    });
    const ctx = document.getElementById('monthlyAttendanceChart').getContext('2d');
    if (monthlyAttendanceChart) {
        monthlyAttendanceChart.destroy();
    }
    const selectedDate = new Date(selectedYear, selectedMonth);
    monthlyAttendanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Periods Present',
                data: presentData,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
            }, {
                label: 'Periods Absent',
                data: absentData,
                backgroundColor: 'rgba(255, 99, 132, 0.6)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `Attendance for ${selectedDate.toLocaleString('default', { month: 'long' })}` }
            },
            scales: {
                x: { stacked: true, title: { display: true, text: 'Day of the Month' } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Number of Periods' } }
            }
        }
    });
}

// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('attendanceDate');
    const monthSelect = document.getElementById('monthSelect');
    const yearSelect = document.getElementById('yearSelect');

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = month;
        monthSelect.appendChild(option);
    });

    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 3; i++) {
        const option = document.createElement('option');
        option.value = currentYear - i;
        option.textContent = currentYear - i;
        yearSelect.appendChild(option);
    }
    
    monthSelect.value = new Date().getMonth();
    yearSelect.value = currentYear;

    const today = new Date().toISOString().split('T')[0];
    datePicker.value = today;

    displayStudentDetails();
    fetchAndDisplayDailyAttendance(today);
    calculateOverallSemesterAttendance();
    calculateMonthlyPercentagesAndAlerts();
    fetchAndRenderMonthlyChart();

    datePicker.addEventListener('change', (e) => {
        fetchAndDisplayDailyAttendance(e.target.value);
    });

    const refreshMonthlyViews = () => {
        calculateMonthlyPercentagesAndAlerts();
        fetchAndRenderMonthlyChart();
    };
    monthSelect.addEventListener('change', refreshMonthlyViews);
    yearSelect.addEventListener('change', refreshMonthlyViews);
    
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    });
    
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const body = document.body;
    const applyTheme = (theme) => {
        body.setAttribute('data-theme', theme);
        themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('studentTheme', theme);
        const isDark = theme === 'dark';
        Chart.defaults.color = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
        Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
        if (monthlyAttendanceChart) {
            fetchAndRenderMonthlyChart();
        }
    };
    const savedTheme = localStorage.getItem('studentTheme') || 'light';
    applyTheme(savedTheme);
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });

    const profileIconBtn = document.getElementById('profileIconBtn');
    const modal = document.getElementById('profileModal');
    const overlay = document.getElementById('profileModalOverlay');
    const closeBtn = document.getElementById('modalCloseBtn');
    const pageContainer = document.getElementById('page-container');
    const openModal = () => {
        modal.classList.add('active');
        overlay.classList.add('active');
        pageContainer.classList.add('blurred');
    };
    const closeModal = () => {
        modal.classList.remove('active');
        overlay.classList.remove('active');
        pageContainer.classList.remove('blurred');
    };
    profileIconBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
});
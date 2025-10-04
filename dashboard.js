import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// IMPORTANT: Move these keys to a secure environment (.env file) and do not commit them to version control.
// Your new web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBBJHLe2yUYTvYywGS5pt0J1TRA71GI2cw",
    authDomain: "analytics-899d1.firebaseapp.com",
    projectId: "analytics-899d1",
    storageBucket: "analytics-899d1.firebasestorage.app",
    messagingSenderId: "398748085171",
    appId: "1:398748085171:web:8d674af6871c58ff25f9c6",
    measurementId: "G-4T9J8YKEG7"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variables to hold chart instances
let attendanceBarChart = null;
let attendancePieChart = null;
let weeklyChart = null;
let monthlyChart = null;

// Flags to prevent re-fetching data from Firestore unnecessarily
let facultyDataLoaded = false;
let studentsDataLoaded = false;
let timetableDataLoaded = false;

let presentStudentDetails = [];
let absentStudentDetails = [];


// Read user data from session storage.
const userData = JSON.parse(sessionStorage.getItem('loggedInUser'));
if (!userData) {
    window.location.href = 'login.html'; // Redirect to login if not authenticated
}
const userDept = userData.dept;
const userDetails=userData.details;

/**
 * Returns the dynamically generated class ID based on department, year, and section.
 * @returns {string} The formatted class ID (e.g., "ECA_3_A").
 */
function getUserClassId() {
    const year = document.getElementById('yearSelect').value;
    const section = document.getElementById('sectionSelect').value;
    return `${userDept}_${year}_${section}`;
}

/**
 * Updates the UI and reloads all data for the selected class.
 */
function reloadAllData() {
    const userClassId = getUserClassId();
    document.getElementById('department-info').textContent = `${userDetails}`;
    const classIdDisplay = document.getElementById('class-id-display');
    if (classIdDisplay) {
        classIdDisplay.textContent = `${userClassId}`;
    }

    // Reset data loaded flags to force a new fetch for the new class
    facultyDataLoaded = false;
    studentsDataLoaded = false;
    timetableDataLoaded = false;

    // Reload the data for the currently active section
    const activeSection = document.querySelector('.content-section[style*="display: block"]');
    const sectionName = activeSection ? activeSection.id.replace('-section', '') : 'dashboard';
    
    // Check and load the content for the current section
    switch(sectionName) {
        case 'dashboard':
            const datePicker = document.getElementById('attendanceDate');
            if (datePicker.value) {
                const dateString = datePicker.value;
                loadAttendance(dateString);
                loadDailyAttendancePieChart(dateString);
                loadWeeklyAttendanceChart(dateString);
                loadMonthlyAttendanceChart(dateString);
            }
            break;
        case 'students':
            loadAndDisplayStudents();
            break;
        case 'faculty':
            loadAndDisplayFaculty();
            break;
        case 'timetables':
            loadAndDisplayTimetable();
            break;
    }
}


/**
 * Gets the day of the week string (e.g., "Monday") from a date string.
 * @param {string} dateString - The date in 'YYYY-MM-DD' format.
 * @returns {string} The full name of the day of the week.
 */
function getDayOfWeek(dateString) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    try {
        const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
        return days[date.getDay()];
    } catch (e) {
        console.error("Invalid date string provided:", dateString);
        return "";
    }
}

/**
 * Fetches and processes subject details and timetable for a given date.
 * Returns an ordered list of subjects and their full names.
 * @param {string} dateString - The date in 'YYYY-MM-DD' format.
 * @returns {Object} An object with labels, subject codes, and a subject map.
 */
async function fetchTimetableAndSubjectDetails(dateString) {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return { labels: [], subjectCodes: [] };
    const dayOfWeek = getDayOfWeek(dateString);
    const subjectMap = {};
    const timetableLabels = [];
    const timetableSubjectCodes = [];
    
    try {
        // Fetch all subject details for name mapping
        const subjectSnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/faculty_sub_details`));
        subjectSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.subject_code && data.subject_name) {
                subjectMap[data.subject_code] = data.subject_name;
            }
        });

        // Fetch the timetable for the given day
        const timetableDocRef = doc(db, `College/RMKEC/${userDept}/${userClassId}/${userClassId}_timetable/${dayOfWeek}`);
        const timetableDocSnap = await getDoc(timetableDocRef);
        
        if (!timetableDocSnap.exists()) {
            console.warn(`No timetable data found for ${dayOfWeek}.`);
            return { labels: [], subjectCodes: [] };
        }
        
        const periodsData = timetableDocSnap.data();
        const sortedPeriodKeys = Object.keys(periodsData).sort((a, b) => {
            const periodNumA = parseInt(a.split('_')[1], 10);
            const periodNumB = parseInt(b.split('_')[1], 10);
            return periodNumA - periodNumB;
        });

        sortedPeriodKeys.forEach(periodKey => {
            const periodData = periodsData[periodKey];
            const subjectCode = periodData.subject_code;
            const periodNumber = periodKey.split('_')[1];
            timetableLabels.push(`${subjectCode}_${periodNumber}`);
            timetableSubjectCodes.push(`${subjectCode}_${periodNumber}`);
        });
        
    } catch (error) {
        console.error("Error fetching timetable and subject details:", error);
    }
    return { labels: timetableLabels, subjectCodes: timetableSubjectCodes };
}

/**
 * Fetches and processes attendance data based on the timetable for a specific date.
 * Renders a subject-wise bar chart.
 * @param {string} dateString - The date in 'YYYY-MM-DD' format.
 */
async function loadAttendance(dateString) {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;
    try {
        const { labels, subjectCodes } = await fetchTimetableAndSubjectDetails(dateString);

        if (subjectCodes.length === 0) {
            document.getElementById('activeSubjectsValue').textContent = '0';
            if (attendanceBarChart) attendanceBarChart.destroy();
            const chartContainer = document.getElementById("bar-chart-container");
            chartContainer.innerHTML = "<canvas id='attendanceChart'></canvas><p class='chart-message'>No timetable data for this day.</p>";
            return;
        }

        document.getElementById('activeSubjectsValue').textContent = subjectCodes.length;

        const attendanceCollectionPath = `College/RMKEC/${userDept}/${userClassId}/attendance/${dateString}/students`;
        const attendanceSnapshot = await getDocs(collection(db, attendanceCollectionPath));
        const students = attendanceSnapshot.docs.map(doc => doc.data());

        if (students.length === 0) {
            if (attendanceBarChart) attendanceBarChart.destroy();
            const chartContainer = document.getElementById("bar-chart-container");
            chartContainer.innerHTML = "<canvas id='attendanceChart'></canvas><p class='chart-message'>No attendance data available for this date.</p>";
            return;
        }

        const counts = {};
        subjectCodes.forEach(key => counts[key] = { present: 0, total: students.length });

        students.forEach(stu => {
            Object.keys(stu).forEach(key => {
                if (subjectCodes.includes(key)) {
                    if (stu[key] && typeof stu[key] === 'string' && stu[key].startsWith("Present")) {
                        counts[key].present++;
                    }
                }
            });
        });

        const data = subjectCodes.map(s =>
            counts[s].total > 0 ? (counts[s].present / counts[s].total) * 100 : 0
        );
        
        if (attendanceBarChart) {
            attendanceBarChart.destroy();
        }
        
        let chartCanvas = document.getElementById("attendanceChart");
        if (!chartCanvas) {
            const chartContainer = document.getElementById("bar-chart-container");
            chartContainer.innerHTML = "<canvas id='attendanceChart'></canvas>";
            chartCanvas = document.getElementById("attendanceChart");
        }

        const isDarkMode = document.body.classList.contains('dark-theme');
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDarkMode ? '#e0e0e0' : '#333';

        attendanceBarChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Attendance %',
                    data: data,
                    backgroundColor: "rgba(54, 162, 235, 0.6)",
                    borderColor: "rgba(54, 162, 235, 1)",
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: textColor,
                            minRotation: 0, 
                            maxRotation: 0 
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: textColor,
                            callback: value => value + "%"
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading bar chart data:", error);
        if (attendanceBarChart) attendanceBarChart.destroy();
        const chartContainer = document.getElementById("bar-chart-container");
        chartContainer.innerHTML = "<canvas id='attendanceChart'></canvas><p class='chart-message' style='color: red;'>Could not load chart data.</p>";
    }
}

/**
 * Fetches overall day attendance, renders a pie chart, and updates stat cards.
 * @param {string} dateString - The date in 'YYYY-MM-DD' format.
 */
// dashboard.js

async function loadDailyAttendancePieChart(dateString) {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;

    // Reset the arrays for new data
    presentStudentDetails = [];
    absentStudentDetails = [];

    try {
        const attendanceCollectionPath = `College/RMKEC/${userDept}/${userClassId}/attendance/${dateString}/students`;
        const snapshot = await getDocs(collection(db, attendanceCollectionPath));
        
        // Step 1: Create the detailed lists for the popup
        snapshot.docs.forEach(doc => {
            const studentData = doc.data();
            const studentInfo = {
                roll: doc.id,
                name: studentData.students_name || 'Name not available'
            };
            const isPresent = Object.values(studentData).some(status => typeof status === 'string' && status.startsWith("Present"));
            
            if (isPresent) {
                presentStudentDetails.push(studentInfo);
            } else {
                absentStudentDetails.push(studentInfo);
            }
        });
        
        presentStudentDetails.sort((a, b) => a.roll.localeCompare(b.roll));
        absentStudentDetails.sort((a, b) => a.roll.localeCompare(b.roll));

        // Step 2: Get the counts FROM THE LISTS. This is the single source of truth.
        const totalStudents = snapshot.size;
        const presentStudentsCount = presentStudentDetails.length;
        const absentStudentsCount = absentStudentDetails.length;

        // Step 3: Use the correct counts to update the UI
        const attendancePercentage = totalStudents > 0 ? Math.round((presentStudentsCount / totalStudents) * 100) : 0;
        document.getElementById('totalStudentsValue').textContent = totalStudents;
        document.getElementById('overallAttendanceValue').textContent = `${attendancePercentage}%`;
        document.getElementById('defaultersValue').textContent = absentStudentsCount;

        // The rest of the code draws the chart using these correct counts
        if (attendancePieChart) {
            attendancePieChart.destroy();
        }
        const pieChartCanvas = document.getElementById("dailyAttendancePieChart");
        const isDarkMode = document.body.classList.contains('dark-theme');
        const textColor = isDarkMode ? '#e0e0e0' : '#333';
        
        attendancePieChart = new Chart(pieChartCanvas, {
            type: 'pie',
            data: {
                labels: ['Present', 'Absent'],
                datasets: [{
                    label: 'Day Attendance',
                    data: [presentStudentsCount, absentStudentsCount],
                    backgroundColor: ['rgba(75, 192, 192, 0.7)', 'rgba(255, 99, 132, 0.7)'],
                    borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor } }
                }
            }
        });

    } catch (error) {
        console.error("Error loading pie chart data and student lists:", error);
    }
}
/**
 * REWRITTEN: Fetches attendance for a specific week of the month (e.g., week 1, 2, 3, 4, or 5).
 * The week is determined by a dropdown with the ID "weekSelect". The chart is a BAR chart.
 * @param {string} baseDateString - A date used to determine the current month and year.
 */
async function loadWeeklyAttendanceChart(baseDateString) {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;

    // **CHANGE 1: Get the selected week from the dropdown menu.**
    const selectedWeek = parseInt(document.getElementById('weekSelect').value, 10);
    
    const baseDate = new Date(baseDateString + 'T00:00:00');
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth(); // 0-indexed (e.g., January is 0)

    const dates = [];
    const labels = [];
    
    // **CHANGE 2: New logic to calculate dates for the specific week of the month.**
    // Calculate the start and end day numbers for the selected week.
    const startDayOfMonth = (selectedWeek - 1) * 7 + 1;
    const endDayOfMonth = startDayOfMonth + 6;

    // Loop through the days of the selected week.
    for (let day = startDayOfMonth; day <= endDayOfMonth; day++) {
        const date = new Date(year, month, day);

        // We must perform two checks:
        // 1. Ensure the generated date is still within the correct month (e.g., skip Feb 30th).
        // 2. Ensure the day is not a Sunday (getDay() === 0).
        if (date.getMonth() === month && date.getDay() !== 0) {
            const yearStr = date.getFullYear();
            const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
            const dayStr = date.getDate().toString().padStart(2, '0');
            
            dates.push(`${yearStr}-${monthStr}-${dayStr}`);
            labels.push(`${dayStr}/${monthStr}`);
        }
    }

    try {
        // For a more accurate percentage, we get the total number of students in the class
        const studentDocs = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/student`));
        const totalStudentsInClass = studentDocs.size;

        const attendancePromises = dates.map(date => {
            const path = `College/RMKEC/${userDept}/${userClassId}/attendance/${date}/students`;
            return getDocs(collection(db, path));
        });

        const snapshots = await Promise.all(attendancePromises);

        const dailyPercentages = snapshots.map(snapshot => {
            if (snapshot.empty || totalStudentsInClass === 0) return 0;

            const presentRollNumbers = new Set();
            snapshot.docs.forEach(doc => {
                 if (Object.values(doc.data()).some(status => String(status).startsWith("Present"))) {
                    presentRollNumbers.add(doc.id);
                }
            });
            // Calculate percentage based on the entire class
            return (presentRollNumbers.size / totalStudentsInClass) * 100;
        });

        if (weeklyChart) weeklyChart.destroy();

        const isDarkMode = document.body.classList.contains('dark-theme');
        const textColor = isDarkMode ? '#f1f5f9' : '#1a202c';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        
        // The chart type remains 'bar' as previously requested.
        weeklyChart = new Chart(document.getElementById('weeklyAttendanceChart'), {
            type: 'bar', 
            data: {
                labels: labels,
                datasets: [{
                    label: 'Weekly Attendance %',
                    data: dailyPercentages,
                    backgroundColor: 'rgba(237, 137, 54, 0.6)', // Accent color from your theme
                    borderColor: 'rgba(237, 137, 54, 1)',
                    borderWidth: 1,
                    borderRadius: 5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: { 
                        beginAtZero: true, 
                        max: 100, 
                        ticks: { color: textColor, callback: v => Math.round(v) + '%' }, 
                        grid: { color: gridColor } 
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading weekly chart data:", error);
    }
}
/**
 * REWRITTEN: Fetches attendance for a specific month selected from a dropdown.
 * The year is determined by the main date picker. The chart is a LINE chart and excludes Sundays.
 * @param {string} baseDateString - A date used to determine the current year.
 */
async function loadMonthlyAttendanceChart(baseDateString) {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;

    // Get the year from the main date picker
    const year = new Date(baseDateString + 'T00:00:00').getFullYear();
    // Get the selected month (0-11) from the new dropdown
    const month = parseInt(document.getElementById('monthSelect').value, 10);
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];
    const labels = [];

    // Loop through all days of the selected month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);

        // Skip Sundays
        if (date.getDay() !== 0) {
            const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
            const dayStr = date.getDate().toString().padStart(2, '0');
            dates.push(`${year}-${monthStr}-${dayStr}`);
            labels.push(dayStr);
        }
    }

    try {
        const studentDocs = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/student`));
        const totalStudentsInClass = studentDocs.size;

        const attendancePromises = dates.map(date => {
            const path = `College/RMKEC/${userDept}/${userClassId}/attendance/${date}/students`;
            return getDocs(collection(db, path));
        });

        const snapshots = await Promise.all(attendancePromises);

        const monthlyPercentages = snapshots.map(snapshot => {
            if (snapshot.empty || totalStudentsInClass === 0) return 0;
            const presentRollNumbers = new Set();
            snapshot.docs.forEach(doc => {
                 if (Object.values(doc.data()).some(status => String(status).startsWith("Present"))) {
                    presentRollNumbers.add(doc.id);
                }
            });
            return (presentRollNumbers.size / totalStudentsInClass) * 100;
        });

        if (monthlyChart) monthlyChart.destroy();
        
        const isDarkMode = document.body.classList.contains('dark-theme');
        const textColor = isDarkMode ? '#f1f5f9' : '#1a202c';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

        monthlyChart = new Chart(document.getElementById('monthlyAttendanceChart'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Monthly Attendance %`,
                    data: monthlyPercentages,
                    borderColor: 'rgba(187, 170, 72, 1)',
                    backgroundColor: 'rgba(187, 170, 72, 0.2)',
                    fill: true,
                    tension: 0.3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textColor, autoSkip: true, maxTicksLimit: 15 }, grid: { display: false } },
                    y: { beginAtZero: true, max: 100, ticks: { color: textColor, callback: v => Math.round(v) + '%' }, grid: { color: gridColor } }
                }
            }
        });
    } catch (error) {
        console.error("Error loading monthly chart data:", error);
    }
}


/**
 * Fetches faculty and subject details from Firestore and populates the table.
 */
async function loadAndDisplayFaculty() {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;
    const tableBody = document.getElementById('faculty-table-body');
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading faculty data...</td></tr>';
    try {
        const querySnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/faculty_sub_details`));
        let tableHTML = '';
        if (querySnapshot.empty) {
            tableHTML = '<tr><td colspan="3" style="text-align:center;">No faculty data found.</td></tr>';
        } else {
            querySnapshot.forEach(doc => {
                const data = doc.data();
                tableHTML += `<tr><td>${data.subject_code || 'N/A'}</td><td>${data.subject_name || 'N/A'}</td><td>${data.faculty_name || 'N/A'}</td></tr>`;
            });
        }
        tableBody.innerHTML = tableHTML;
        facultyDataLoaded = true;
    } catch (error) {
        console.error("Error fetching faculty data:", error);
        tableBody.innerHTML = '<tr><td colspan="3" style="color:red; text-align:center;">Failed to load data.</td></tr>';
    }
}

/**
 * Fetches and sorts student details from Firestore.
 */
async function loadAndDisplayStudents() {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;
    const tableBody = document.getElementById('students-table-body');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading student data...</td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/student`));
        let tableHTML = '';

        if (querySnapshot.empty) {
            tableHTML = '<tr><td colspan="5" style="text-align:center;">No student data found.</td></tr>';
        } else {
            const studentList = querySnapshot.docs.map(doc => ({
                roll_number: doc.id,
                ...doc.data()
            }));
            
            studentList.sort((a, b) => {
                return (a.roll_number || "").localeCompare(b.roll_number || "");
            });
            
            studentList.forEach(data => {
                tableHTML += `
                    <tr>
                        <td>${data.roll_number || 'N/A'}</td>
                        <td>${data.name || 'N/A'}</td>
                        <td>${data.department || data.dept || 'N/A'}</td>
                        <td>${data.section || 'N/A'}</td>
                        <td>${data.year || 'N/A'}</td>
                    </tr>
                `;
            });
        }
        tableBody.innerHTML = tableHTML;
        studentsDataLoaded = true;
    } catch (error) {
        console.error("Error fetching student data:", error);
        tableBody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Failed to load data.</td></tr>';
    }
}

/**
 * Fetches timetable data from Firestore and renders it as a grid-style HTML table.
 */
async function loadAndDisplayTimetable() {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) return;
    const container = document.getElementById('timetable-container');
   
    try {
        const querySnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/${userClassId}_timetable`));

        if (querySnapshot.empty) {
            container.innerHTML = "<p style='text-align:center; color:orange;'>No timetable data found.</p>";
            return;
        }

        const gridData = {};
        const timeSlots = new Set();
        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        querySnapshot.forEach(doc => {
            const day = doc.id;
            const periods = doc.data();
            Object.keys(periods).forEach(periodKey => {
                const periodData = periods[periodKey];
                const slotKey = `${periodData.start}-${periodData.end}`;
                timeSlots.add(slotKey);
                if (!gridData[slotKey]) {
                    gridData[slotKey] = {};
                }
                gridData[slotKey][day] = periodData.subject_code;
            });
        });

        const sortedTimeSlots = Array.from(timeSlots).sort((a, b) => {
            const getComparableTime = (timeString) => {
                let [hours, minutes] = timeString.split(':').map(num => parseInt(num, 10));
                // Represent time in minutes for easy comparison.
                return hours * 60 + minutes;
            };
            const startTimeA = a.split('-')[0];
            const startTimeB = b.split('-')[0];
            return getComparableTime(startTimeA) - getComparableTime(startTimeB);
        });

        const formatTo12Hour = (time) => {
            const [hours, minutes] = time.split(':').map(num => parseInt(num, 10));
            const suffix = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 || 12; // The hour '0' should be '12'
            const formattedMinutes = minutes.toString().padStart(2, '0');
            return `${formattedHours}:${formattedMinutes} ${suffix}`;
        };

        let tableHTML = `<table class="timetable-grid-table"><thead><tr><th>Time</th>`;

        dayOrder.forEach(day => {
            tableHTML += `<th>${day}</th>`;
        });
        tableHTML += `</tr></thead><tbody>`;

        sortedTimeSlots.forEach(slot => {
            const [start, end] = slot.split('-');
            const formattedStart = formatTo12Hour(start);
            const formattedEnd = formatTo12Hour(end);
            tableHTML += `<tr><td><b>${formattedStart} - ${formattedEnd}</b></td>`;
            dayOrder.forEach(day => {
                const subjectCode = gridData[slot]?.[day] || '';
                tableHTML += `<td>${subjectCode}</td>`;
            });
            tableHTML += `</tr>`;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
        timetableDataLoaded = true;

    } catch (error) {
        console.error("Error fetching timetable data:", error);
        container.innerHTML = "<p style='text-align:center; color:red;'>Failed to load timetable.</p>";
    }
}


/**
 * A helper function to sanitize a string for CSV format.
 * @param {string | number} value - The value to sanitize.
 * @returns {string} The sanitized string, ready for a CSV file.
 */
function sanitizeCSVValue(value) {
    let strValue = String(value);
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        strValue = `"${strValue.replace(/"/g, '""')}"`;
    }
    return strValue;
}

/**
 * Fetches and processes attendance data for download as a CSV file.
 */
async function downloadAttendanceAsExcel() {
    const userClassId = getUserClassId();
    const selectedDate = document.getElementById('attendanceDate').value;
    if (!selectedDate) {
        alert("Please select a date first.");
        return;
    }

    try {
        const dayOfWeek = getDayOfWeek(selectedDate);
        const timetableDocRef = doc(db, `College/RMKEC/${userDept}/${userClassId}/${userClassId}_timetable/${dayOfWeek}`);
        const timetableDocSnap = await getDoc(timetableDocRef);

        if (!timetableDocSnap.exists()) {
            alert(`No timetable found for ${dayOfWeek}.`);
            return;
        }

        const periodsData = timetableDocSnap.data();
        const sortedPeriodKeys = Object.keys(periodsData).sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10));
        const subjectHeaders = sortedPeriodKeys.map(key => `${periodsData[key].subject_code}_${key.split('_')[1]}`);

        const attendanceSnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/attendance/${selectedDate}/students`));
        if (attendanceSnapshot.empty) {
            alert(`No attendance data found for ${selectedDate}.`);
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["roll_no", "name", ...subjectHeaders];
        csvContent += headers.map(sanitizeCSVValue).join(",") + "\n";

        for (const doc of attendanceSnapshot.docs) {
            const rowData = [doc.id, doc.data().students_name || 'N/A'];
            subjectHeaders.forEach(subjectKey => {
                rowData.push(doc.data()[subjectKey] || "Absent");
            });
            csvContent += rowData.map(sanitizeCSVValue).join(",") + "\n";
        }
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_${userClassId}_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        console.error("Error downloading attendance:", error);
        alert("Failed to download attendance data.");
    }
}

async function downloadStudentDetailsAsExcel() {
    const userClassId = getUserClassId();
    if (!userDept || !userClassId) {
        alert("User data not found. Please log in again.");
        return;
    }
    try {
        const studentsSnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/student`));
        const studentData = studentsSnapshot.docs.map(doc => ({ roll_no: doc.id, ...doc.data() }));

        if (studentData.length === 0) {
            alert("No student data found to download.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["roll_no", "name", "dept", "year", "section"];
        csvContent += headers.map(sanitizeCSVValue).join(",") + "\n";

        studentData.forEach(student => {
            const rowData = [
                student.roll_no || 'N/A',
                student.name || 'N/A',
                student.dept || student.department || 'N/A',
                student.year || 'N/A',
                student.section || 'N/A'
            ];
            csvContent += rowData.map(sanitizeCSVValue).join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "student_details.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        console.error("Error downloading student details:", error);
        alert("Failed to download student details. Please check the console for details.");
    }
}

async function downloadFacultyDetailsAsExcel() {
    const userClassId = getUserClassId();
    try {
        const facultySnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/faculty_sub_details`));
        if (facultySnapshot.empty) {
            alert("No faculty data found to download.");
            return;
        }
        const facultyData = facultySnapshot.docs.map(doc => doc.data());

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["subject_code", "subject_name", "faculty_name"];
        csvContent += headers.map(sanitizeCSVValue).join(",") + "\n";

        facultyData.forEach(faculty => {
            const rowData = [ faculty.subject_code, faculty.subject_name, faculty.faculty_name ];
            csvContent += rowData.map(sanitizeCSVValue).join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `faculty_${userClassId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("Error downloading faculty details:", error);
        alert("Failed to download faculty details.");
    }
}

/**
 * UPDATED: Fetches timetable data and downloads it as a CSV file.
 */
async function downloadTimetableAsExcel() {
    const userClassId = getUserClassId();
    try {
        const timetableSnapshot = await getDocs(collection(db, `College/RMKEC/${userDept}/${userClassId}/${userClassId}_timetable`));
        if (timetableSnapshot.empty) {
            alert("No timetable data found to download.");
            return;
        }

        const gridData = {};
        const timeSlots = new Set();
        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        timetableSnapshot.forEach(doc => {
            const day = doc.id;
            const periods = doc.data();
            Object.values(periods).forEach(periodData => {
                const slotKey = `${periodData.start}-${periodData.end}`;
                timeSlots.add(slotKey);
                if (!gridData[slotKey]) gridData[slotKey] = {};
                gridData[slotKey][day] = periodData.subject_code;
            });
        });

        const sortedTimeSlots = Array.from(timeSlots).sort((a, b) => {
             const timeA = parseInt(a.split(':')[0], 10) * 60 + parseInt(a.split(':')[1].split('-')[0], 10);
             const timeB = parseInt(b.split(':')[0], 10) * 60 + parseInt(b.split(':')[1].split('-')[0], 10);
             return timeA - timeB;
        });

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["Time", ...dayOrder];
        csvContent += headers.map(sanitizeCSVValue).join(",") + "\n";
        
        sortedTimeSlots.forEach(slot => {
            const rowData = [slot];
            dayOrder.forEach(day => {
                rowData.push(gridData[slot]?.[day] || '-');
            });
            csvContent += rowData.map(sanitizeCSVValue).join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `timetable_${userClassId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        console.error("Error downloading timetable:", error);
        alert("Failed to download timetable.");
    }
}

// --- Main Event Listener ---
// dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const datePicker = document.getElementById('attendanceDate');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');
    const downloadStudentsBtn = document.getElementById('downloadStudentsBtn');
    const downloadFacultyBtn = document.getElementById('downloadFacultyBtn');
    const downloadTimetableBtn = document.getElementById('downloadTimetableBtn');
    const yearSelect = document.getElementById('yearSelect');
    const sectionSelect = document.getElementById('sectionSelect');
    const weekSelect = document.getElementById('weekSelect');
    const monthSelect = document.getElementById('monthSelect');
    
    // Modal elements
    const showPresentBtn = document.getElementById('showPresentBtn');
    const showAbsentBtn = document.getElementById('showAbsentBtn');
    const modalOverlay = document.getElementById('student-list-overlay');
    const modalBox = document.getElementById('student-list-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalStudentList = document.getElementById('modal-student-list');
    const backgroundContent = document.getElementById('main-content-to-blur');

    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggleBtn.textContent = '☀️';
    }

    const getTodayDateString = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    datePicker.value = getTodayDateString();

    reloadAllData();

    // Event listeners
    yearSelect.addEventListener('change', reloadAllData);
    sectionSelect.addEventListener('change', reloadAllData);

    // FIXED: This is the single, correct listener that prevents the double-run.
    datePicker.addEventListener('change', () => {
        monthSelect.value = new Date(datePicker.value).getMonth();
        reloadAllData();
    });

    weekSelect.addEventListener('change', () => loadWeeklyAttendanceChart(datePicker.value));
    monthSelect.addEventListener('change', () => loadMonthlyAttendanceChart(datePicker.value));

    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        let theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('theme', theme);
        reloadAllData();
    });
    
    downloadExcelBtn.addEventListener('click', downloadAttendanceAsExcel);
    downloadStudentsBtn.addEventListener('click', downloadStudentDetailsAsExcel);
    downloadFacultyBtn.addEventListener('click', downloadFacultyDetailsAsExcel);
    if (downloadTimetableBtn) {
        downloadTimetableBtn.addEventListener('click', downloadTimetableAsExcel);
    }

    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', (event) => {
        if (sidebar.classList.contains('active')) {
             sidebar.classList.remove('active');
             overlay.classList.remove('active');
        }
    });

    // Modal logic
    const openModal = (listType) => {
        const isPresent = listType === 'present';
        const listData = isPresent ? presentStudentDetails : absentStudentDetails;
        modalTitle.textContent = isPresent ? 'Present Students' : 'Absent Students';
        
        if (listData.length === 0) {
            modalStudentList.innerHTML = `<p>No students in this list.</p>`;
        } else {
            modalStudentList.innerHTML = listData
                .map(student => `<p><strong>${student.roll}</strong> - ${student.name}</p>`)
                .join('');
        }
        
        backgroundContent.classList.add('blurred');
        modalOverlay.classList.add('visible');
        modalBox.classList.add('visible');
    };

    const closeModal = () => {
        backgroundContent.classList.remove('blurred');
        modalOverlay.classList.remove('visible');
        modalBox.classList.remove('visible');
    };

    showPresentBtn.addEventListener('click', () => openModal('present'));
    showAbsentBtn.addEventListener('click', () => openModal('absent'));
    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            closeModal();
        }
    });

    const feedbackForm = document.getElementById('feedbackForm');
    feedbackForm.addEventListener('submit', (event) => {
        event.preventDefault(); 
        const feedbackText = document.getElementById('feedbackText').value;
        const recipientEmail = '230289.ea@rmkec.ac.in';
        const subject = 'Feedback from Attendance Dashboard';
        const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackText)}`;
        window.location.href = mailtoLink;
        alert('Your email client will now open to send the feedback.');
        document.getElementById('feedbackText').value = ''; 
    });
});
window.showSection = function(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });

    const activeSection = document.getElementById(sectionName + '-section');
    if (activeSection) {
        activeSection.style.display = 'block';
    } else {
        document.getElementById('dashboard-section').style.display = 'block';
    }

    if (sectionName === 'faculty' && !facultyDataLoaded) {
        loadAndDisplayFaculty();
    }
    if (sectionName === 'students' && !studentsDataLoaded) {
        loadAndDisplayStudents();
    }
    if (sectionName === 'timetables' && !timetableDataLoaded) {
        loadAndDisplayTimetable();
    }
    
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

window.logout = function() {
    sessionStorage.removeItem('loggedInUser');
    console.log('User logged out.');
    window.location.href = 'login.html';
}
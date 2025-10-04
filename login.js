import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-analytics.js";

// Your Firebase configuration
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
const analytics = getAnalytics(app);

document.addEventListener('DOMContentLoaded', () => {
    // Your existing session check logic
    const loggedInUser = sessionStorage.getItem('loggedInUser');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        if (user.role === 'student') {
            window.location.href = 'student_dashboard.html';
        } else {
            window.location.href = 'dashboard.html';
        }
        return;
    }

    // Your existing element references remain unchanged
    const splashScreen = document.getElementById('splashScreen');
    const loginPage = document.getElementById('loginPage');
    const changePasswordPage = document.getElementById('changePasswordPage');
    const loginForm = document.getElementById('loginForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const changeErrorMessage = document.getElementById('changeErrorMessage');
    const changeSuccessMessage = document.getElementById('changeSuccessMessage');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    // Your existing splash screen logic
    setTimeout(() => {
        splashScreen.style.display = 'none';
        loginPage.style.display = 'flex';
    }, 2000);

    // Your existing password toggle logic
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.classList.toggle('fa-eye');
        togglePassword.classList.toggle('fa-eye-slash');
    });

    // --- MODIFIED LOGIN LOGIC ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = e.target.username.value.trim();
        const password = e.target.password.value;
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        // START: Added logic to handle roles
        const role = document.querySelector('input[name="role"]:checked').value;
        // Correctly sets collection name based on your screenshot and our plan
        let collectionName = role === 'hod' ? 'users' : 'Students'; 
        // END: Added logic

        try {
            const userDocRef = doc(db, collectionName, username);
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                errorMessage.textContent = 'Invalid username or password.';
                errorMessage.style.display = 'block';
                return;
            }

            const userData = userDocSnap.data();
            
            if (userData.password === password) {
                successMessage.textContent = 'Login successful! Redirecting...';
                successMessage.style.display = 'block';

                // START: Added logic for role-based redirection
                if (role === 'hod') {
                    sessionStorage.setItem('loggedInUser', JSON.stringify({
                        role: 'hod',
                        dept: userData.dept,
                        details: userData.details
                        // Add any other HOD-specific data from Firestore here
                    }));
                    
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

                } else if (role === 'student') {
                    sessionStorage.setItem('loggedInUser', JSON.stringify({
                        role: 'student',
                        ...userData // Store all student fields (name, roll_number, etc.)
                    }));
                    
                    setTimeout(() => { window.location.href = 'student_dashboard.html'; }, 1000);
                }
                // END: Added logic

            } else {
                errorMessage.textContent = 'Incorrect password.';
                errorMessage.style.display = 'block';
            }

        } catch (error) {
            console.error("Login error:", error);
            errorMessage.textContent = 'An error occurred. Please try again.';
            errorMessage.style.display = 'block';
        }
    });

    // --- YOUR EXISTING FUNCTIONS FOR PASSWORD CHANGE ---
    forgotPasswordBtn.addEventListener('click', () => {
        loginPage.style.display = 'none';
        changePasswordPage.style.display = 'flex';
    });

    backToLoginBtn.addEventListener('click', () => {
        changePasswordPage.style.display = 'none';
        loginPage.style.display = 'flex';
    });
    
    // This function remains as it was in your original file
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const oldPassword = e.target.oldPassword.value;
        const newPassword = e.target.newPassword.value;
        const confirmPassword = e.target.confirmPassword.value;
        
        changeErrorMessage.style.display = 'none';
        changeSuccessMessage.style.display = 'none';

        if (newPassword !== confirmPassword) {
            changeErrorMessage.textContent = 'New passwords do not match.';
            changeErrorMessage.style.display = 'block';
            return;
        }

        try {
            // Note: This still points to a 'users' collection as per your original code.
            // You might want to update this logic later if HODs/Students need to change passwords.
            const userDocRef = doc(db, 'users', username); 
            const userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                changeErrorMessage.textContent = 'Username not found. Please go back to login.';
                changeErrorMessage.style.display = 'block';
                return;
            }

            const userData = userDocSnap.data();
            
            if (userData.password === oldPassword) {
                await updateDoc(userDocRef, { password: newPassword });
                changeSuccessMessage.textContent = 'Password updated successfully!';
                changeSuccessMessage.style.display = 'block';
                setTimeout(() => backToLoginBtn.click(), 2000);
            } else {
                changeErrorMessage.textContent = 'Incorrect old password.';
                changeErrorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error("Password change error:", error);
            changeErrorMessage.textContent = 'An error occurred while changing password.';
            changeErrorMessage.style.display = 'block';
        }
    });
});
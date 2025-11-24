// Main Application Logic for Landing Page - Fixed User Info Flow

let selectedJob = null;
let userInfo = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('App initialized');
    loadJobs();
    checkAPIKey();
    setupUserInfoForm();
    
    // Verify modals exist
    const userInfoModal = document.getElementById('userInfoModal');
    const modeModal = document.getElementById('modeModal');
    console.log('User Info Modal found:', !!userInfoModal);
    console.log('Mode Modal found:', !!modeModal);
});

// Check if API key is configured
function checkAPIKey() {
    if (CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        console.warn('⚠️ Please configure your Gemini API key in config.js');
    }
}

// Load all available jobs into the grid
function loadJobs() {
    const jobGrid = document.getElementById('jobGrid');
    if (!jobGrid) {
        console.error('Job grid not found');
        return;
    }
    jobGrid.innerHTML = '';
    
    CONFIG.JOBS.forEach(job => {
        const jobCard = createJobCard(job);
        jobGrid.appendChild(jobCard);
    });
    
    console.log(`Loaded ${CONFIG.JOBS.length} jobs`);
}

// Create a job card element
function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.onclick = () => selectJob(job);
    
    card.innerHTML = `
        <span class="job-icon">${job.icon}</span>
        <h3>${job.title}</h3>
        <p>${job.description}</p>
    `;
    
    return card;
}

// Handle job selection - Open User Info Modal
function selectJob(job) {
    console.log('Job selected:', job.title);
    selectedJob = job;
    
    const infoJobTitle = document.getElementById('infoJobTitle');
    if (infoJobTitle) {
        infoJobTitle.textContent = job.title;
    }
    
    openUserInfoModal();
}

// Setup User Info Form
function setupUserInfoForm() {
    const form = document.getElementById('userInfoForm');
    if (!form) {
        console.error('User info form not found');
        return;
    }
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Collect form data
        const formData = new FormData(form);
        userInfo = {
            fullName: formData.get('fullName').trim(),
            organization: formData.get('organization').trim(),
            degree: formData.get('degree').trim(),
            currentRole: formData.get('currentRole').trim(),
            timestamp: new Date().toISOString()
        };
        
        console.log('User info collected:', userInfo);
        
        // Validate data
        if (!validateUserInfo(userInfo)) {
            return;
        }
        
        // Store user info in sessionStorage
        try {
            sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
            console.log('User info stored in sessionStorage');
        } catch (error) {
            console.error('Error storing user info:', error);
            alert('Error saving your information. Please try again.');
            return;
        }
        
        // Close user info modal and open mode selection modal
        closeUserInfoModal();
        
        console.log('User info submitted. selectedJob:', selectedJob);
        console.log('About to open mode modal...');
        
        // Small delay for smooth transition
        setTimeout(() => {
            openModeModal();
        }, 300);
    });
    
    console.log('User info form setup complete');
}

// Validate user info
function validateUserInfo(info) {
    if (!info.fullName || info.fullName.length < 2) {
        alert('Please enter a valid full name (at least 2 characters)');
        return false;
    }
    
    if (!info.organization || info.organization.length < 2) {
        alert('Please enter a valid organization/college/university name');
        return false;
    }
    
    if (!info.degree || info.degree.length < 2) {
        alert('Please enter a valid degree with major');
        return false;
    }
    
    if (!info.currentRole || info.currentRole.length < 2) {
        alert('Please enter your current job role or "Student"');
        return false;
    }
    
    return true;
}

// Open the user info modal
function openUserInfoModal() {
    const modal = document.getElementById('userInfoModal');
    if (!modal) {
        console.error('User Info Modal not found in DOM');
        alert('Error: Modal not found. Please refresh the page.');
        return;
    }
    
    console.log('Opening user info modal');
    modal.classList.add('active');
    
    // Focus on first input
    setTimeout(() => {
        const firstInput = document.getElementById('fullName');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

// Close the user info modal
function closeUserInfoModal() {
    const modal = document.getElementById('userInfoModal');
    if (!modal) {
        console.error('User Info Modal not found');
        return;
    }
    
    console.log('Closing user info modal');
    modal.classList.remove('active');
    
    // Reset form if user cancels (but only if no userInfo was successfully collected)
    if (!userInfo) {
        const form = document.getElementById('userInfoForm');
        if (form) {
            form.reset();
        }
        // Clear selected job only if user cancelled (didn't submit the form)
        selectedJob = null;
    }
}

// Open the mode selection modal
function openModeModal() {
    if (!selectedJob) {
        console.error('openModeModal called but selectedJob is null!');
        alert('Please select a job role first');
        return;
    }
    
    console.log('Opening mode modal for job:', selectedJob.title);
    
    const selectedJobTitle = document.getElementById('selectedJobTitle');
    if (selectedJobTitle) {
        selectedJobTitle.textContent = selectedJob.title;
    }
    
    const modal = document.getElementById('modeModal');
    if (!modal) {
        console.error('Mode Modal not found');
        return;
    }
    
    console.log('Mode selection modal opened successfully');
    modal.classList.add('active');
}

// Close the mode selection modal
function closeModal() {
    const modal = document.getElementById('modeModal');
    if (!modal) {
        console.error('Mode Modal not found');
        return;
    }
    
    console.log('Closing mode selection modal');
    modal.classList.remove('active');
    
    // Don't clear selectedJob or userInfo - user might want to try again
}

// Handle mode selection and navigate to appropriate page
function selectMode(mode) {
    console.log('Mode selected:', mode);
    
    if (!selectedJob) {
        console.error('selectMode called but selectedJob is null!');
        alert('Please select a job role first');
        return;
    }
    
    if (!userInfo) {
        // If somehow userInfo is missing, reopen the info modal
        console.warn('User info missing, reopening modal');
        closeModal();
        setTimeout(() => openUserInfoModal(), 300);
        return;
    }
    
    // Store selected job in sessionStorage
    try {
        sessionStorage.setItem('selectedJob', JSON.stringify(selectedJob));
        sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
        console.log('Data stored successfully. Job:', selectedJob.title, 'User:', userInfo.fullName);
        console.log('Navigating to', mode, 'mode');
    } catch (error) {
        console.error('Error storing data:', error);
        alert('Error saving your selection. Please try again.');
        return;
    }
    
    // Navigate to the appropriate page
    if (mode === 'chat') {
        window.location.href = 'chat.html';
    } else if (mode === 'voice') {
        window.location.href = 'voice.html';
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const userInfoModal = document.getElementById('userInfoModal');
    const modeModal = document.getElementById('modeModal');
    
    // Close user info modal if clicking on backdrop
    if (e.target === userInfoModal) {
        closeUserInfoModal();
    }
    
    // Close mode selection modal if clicking on backdrop
    if (e.target === modeModal) {
        closeModal();
    }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const userInfoModal = document.getElementById('userInfoModal');
    const modeModal = document.getElementById('modeModal');
    
    if (e.key === 'Escape') {
        if (userInfoModal && userInfoModal.classList.contains('active')) {
            closeUserInfoModal();
        } else if (modeModal && modeModal.classList.contains('active')) {
            closeModal();
        }
    }
});
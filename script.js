// Global variables
let courseData = [];
let selectedCourses = [];
let currentEditingCourse = null;
let isAppInitialized = false;

// Wait for all resources to load before initializing
function waitForDOMAndResources() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve);
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Wait for DOM and all resources to be ready
    await waitForDOMAndResources();
    
    // Prevent multiple initializations
    if (isAppInitialized) {
        return;
    }
    
    // Ensure all required elements exist
    if (!verifyRequiredElements()) {
        console.error('Required DOM elements not found. Retrying in 100ms...');
        setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
        }, 100);
        return;
    }
    
    isAppInitialized = true;
    
    // Hide initial loading screen
    const loadingScreen = document.getElementById('initialLoadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
    
    // Show body content
    document.body.classList.add('loaded');
    
    initializeApp();
    setupEventListeners();
    loadFromLocalStorage();
});

// Verify all required DOM elements exist
function verifyRequiredElements() {
    const requiredElements = [
        'loadDataBtn',
        'resetBtn', 
        'courseSearch',
        'sectionFilter',
        'dayFilter',
        'exportBtn',
        'closeModal',
        'cancelEdit',
        'courseForm',
        'courseModal',
        'loadingState',
        'initialState',
        'courseSelection'
    ];
    
    return requiredElements.every(id => {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Required element not found: ${id}`);
            return false;
        }
        return true;
    });
}

function initializeApp() {
    // Show initial state
    showInitialState();
    
    // Disable browser-specific popup behaviors
    window.addEventListener('beforeunload', function(e) {
        // Only show confirmation if user has selected courses
        if (selectedCourses.length > 0) {
            const message = 'You have unsaved changes. Are you sure you want to leave?';
            e.returnValue = message;
            return message;
        }
    });
}

function setupEventListeners() {
    try {
        // Load data button
        const loadDataBtn = document.getElementById('loadDataBtn');
        if (loadDataBtn) {
            loadDataBtn.addEventListener('click', loadCourseData);
        }
        
        // Reset button
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetApplication);
        }
        
        // Search and filter elements
        const courseSearch = document.getElementById('courseSearch');
        const sectionFilter = document.getElementById('sectionFilter');
        const dayFilter = document.getElementById('dayFilter');
        
        if (courseSearch) {
            courseSearch.addEventListener('input', filterCourses);
        }
        if (sectionFilter) {
            sectionFilter.addEventListener('change', performFilter);
        }
        if (dayFilter) {
            dayFilter.addEventListener('change', performFilter);
        }
        
        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', showExportOptions);
        }
        
        // Modal controls
        const closeModal = document.getElementById('closeModal');
        const cancelEdit = document.getElementById('cancelEdit');
        const courseForm = document.getElementById('courseForm');
        const courseModal = document.getElementById('courseModal');
        
        if (closeModal) {
            closeModal.addEventListener('click', closeModalHandler);
        }
        if (cancelEdit) {
            cancelEdit.addEventListener('click', closeModalHandler);
        }
        if (courseForm) {
            courseForm.addEventListener('submit', saveCourseEdit);
        }
        if (courseModal) {
            courseModal.addEventListener('click', function(e) {
                if (e.target === courseModal) {
                    closeModalHandler();
                }
            });
        }
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

// Helper functions for new API format
function getDepartmentFromCode(courseCode) {
    if (!courseCode) return 'Unknown';
    
    const prefix = courseCode.replace(/[0-9]/g, '');
    return prefix || 'Unknown';
}

function formatScheduleFromAPI(preRegSchedule) {
    if (!preRegSchedule) return '';
    
    // Convert format like "SUNDAY(8:00 AM-9:20 AM-10B-18C)\nTUESDAY(8:00 AM-9:20 AM-10B-18C)"
    // to old format like "Sunday(08:00 AM-09:20 AM-UB0000),Tuesday(08:00 AM-09:20 AM-UB0000)"
    return preRegSchedule
        .split('\n')
        .map(daySchedule => {
            const match = daySchedule.match(/(\w+)\((.+)\)/);
            if (match) {
                const [, day, timeRoom] = match;
                // Capitalize first letter only
                const formattedDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
                return `${formattedDay}(${timeRoom})`;
            }
            return daySchedule;
        })
        .join(',');
}

async function loadCourseData() {
    showLoading();
    
    try {
        // Fetch main course data
        const response = await fetch('https://usis-cdn.eniamza.com/connect.json');
        const data = await response.json();
        
        // Fetch course titles from the new endpoint
        const titleResponse = await fetch('https://usis-cdn.eniamza.com/usisdump.json');
        const titleData = await titleResponse.json();
        
        // Create a map of course codes to course titles
        const courseTitleMap = {};
        titleData.forEach(course => {
            if (course.courseCode && course.courseTitle) {
                courseTitleMap[course.courseCode] = course.courseTitle;
            }
        });
        
        courseData = data.map(course => {
            const mappedTitle = courseTitleMap[course.courseCode];
            const classSchedule = formatScheduleFromAPI(course.preRegSchedule);
            const classLabSchedule = formatScheduleFromAPI(course.preRegLabSchedule || '');
            
            // Pre-compute searchable strings and schedule days
            const courseTitle = mappedTitle || course.courseCode;
            const searchableCode = course.courseCode.toLowerCase();
            const searchableTitle = courseTitle.toLowerCase();
            
            // Extract and cache schedule days
            const scheduleDays = extractScheduleDays(classSchedule);
            
            return {
                id: course.sectionId,
                courseCode: course.courseCode,
                courseTitle: courseTitle,
                empName: course.faculties || 'TBA',
                empShortName: course.faculties || 'TBA',
                deptName: getDepartmentFromCode(course.courseCode),
                classSchedule: classSchedule,
                classLabSchedule: classLabSchedule,
                courseCredit: course.courseCredit,
                availableSeat: course.capacity - course.consumedSeat,
                totalFillupSeat: course.consumedSeat,
                defaultSeatCapacity: course.capacity,
                courseDetails: `${course.sectionName} - ${course.roomName}`,
                preRequisiteCourses: course.prerequisiteCourses || '',
                dayNo: 0,
                sectionName: course.sectionName,
                roomName: course.roomName,
                academicDegree: course.academicDegree,
                labName: course.labName || null,
                labRoomName: course.labRoomName || null,
                // Cached data for performance
                _searchableCode: searchableCode,
                _searchableTitle: searchableTitle,
                _scheduleDays: scheduleDays
            };
        });
        
        populateFilters();
        showCourseSelection();
        displayCourses();
        
        // Save to localStorage with timestamp
        localStorage.setItem('courseData', JSON.stringify(courseData));
        localStorage.setItem('courseDataTimestamp', Date.now().toString());
        
    } catch (error) {
        console.error('Error loading course data:', error);
        showNotification('Failed to load course data. Please check your internet connection and try again.', 'error');
        showInitialStateReady(); // Show manual reload option on error
    }
}

function populateFilters() {
    populateDayFilter();
    // Section filter will be populated dynamically based on search
    populateSectionFilter([]);
}

function populateSectionFilter(filteredCourses) {
    const sectionFilter = document.getElementById('sectionFilter');
    const currentSelection = sectionFilter.value;
    
    // Use Set for O(1) lookup and automatic deduplication
    const sectionsSet = new Set();
    filteredCourses.forEach(course => sectionsSet.add(course.sectionName));
    const sections = Array.from(sectionsSet).sort();
    
    // Only update if sections changed to avoid unnecessary DOM updates
    const currentOptions = Array.from(sectionFilter.options).slice(1).map(option => option.value);
    if (JSON.stringify(currentOptions) === JSON.stringify(sections)) {
        return; // No change needed, exit early
    }
    
    // Build new options
    const fragment = document.createDocumentFragment();
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Sections';
    fragment.appendChild(allOption);
    
    sections.forEach(section => {
        const option = document.createElement('option');
        option.value = section;
        option.textContent = `Section ${section}`;
        fragment.appendChild(option);
    });
    
    // Replace all options at once
    sectionFilter.innerHTML = '';
    sectionFilter.appendChild(fragment);
    
    // Restore selection if it still exists
    if (sections.includes(currentSelection)) {
        sectionFilter.value = currentSelection;
    }
}

function populateDayFilter() {
    const dayFilter = document.getElementById('dayFilter');
    const days = new Set();
    
    // Use cached schedule days instead of parsing each time
    courseData.forEach(course => {
        if (course._scheduleDays) {
            course._scheduleDays.forEach(day => days.add(day));
        }
    });
    
    const sortedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .filter(day => days.has(day));
    
    // Build options using fragment
    const fragment = document.createDocumentFragment();
    
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Days';
    fragment.appendChild(allOption);
    
    sortedDays.forEach(day => {
        const option = document.createElement('option');
        option.value = day;
        option.textContent = day;
        fragment.appendChild(option);
    });
    
    dayFilter.innerHTML = '';
    dayFilter.appendChild(fragment);
}

// Debounce search to improve performance
let searchTimeout;
function filterCourses() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performFilter();
    }, 150);
}

function performFilter() {
    const searchTerm = document.getElementById('courseSearch').value.toLowerCase().trim();
    const selectedSection = document.getElementById('sectionFilter').value;
    const selectedDay = document.getElementById('dayFilter').value;
    
    let filteredCourses = courseData;
    
    // Use cached searchable strings
    if (searchTerm) {
        filteredCourses = filteredCourses.filter(course => 
            course._searchableCode.includes(searchTerm) ||
            course._searchableTitle.includes(searchTerm)
        );
    }
    
    // Update section filter based on search results
    if (searchTerm) {
        populateSectionFilter(filteredCourses);
    }
    
    // Filter by section
    if (selectedSection) {
        filteredCourses = filteredCourses.filter(course => course.sectionName === selectedSection);
    }
    
    // Filter by day using cached data
    if (selectedDay) {
        filteredCourses = filteredCourses.filter(course => course._scheduleDays?.includes(selectedDay));
    }
    
    displayCourses(filteredCourses);
}

// Optimized display with document fragments for better performance
function displayCourses(courses = courseData) {
    const searchResults = document.getElementById('searchResults');
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Group courses by course code (optimized)
    const groupedCourses = new Map();
    courses.forEach(course => {
        if (!groupedCourses.has(course.courseCode)) {
            groupedCourses.set(course.courseCode, []);
        }
        groupedCourses.get(course.courseCode).push(course);
    });
    
    // Clear existing content once
    searchResults.innerHTML = '';
    
    // Create course cards and append to fragment
    groupedCourses.forEach((sections, courseCode) => {
        const courseCard = createCourseCard(courseCode, sections);
        fragment.appendChild(courseCard);
    });
    
    // Single DOM update
    searchResults.appendChild(fragment);
}

// Optimized course card creation
function createCourseCard(courseCode, sections) {
    const card = document.createElement('div');
    card.className = 'course-card bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 fade-in';
    
    const firstSection = sections[0];
    const scheduleText = parseSchedule(firstSection.classSchedule);
    const courseTitle = firstSection.courseTitle;
    
    // Pre-build section HTML to avoid multiple DOM updates
    const sectionsHTML = sections.map(section => {
        const hasLab = section.labName && section.classLabSchedule;
        const labScheduleText = hasLab ? parseSchedule(section.classLabSchedule) : '';
        
        return `
                <div class="bg-gray-50 rounded-lg p-3">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 space-y-2 sm:space-y-0">
                        <div class="flex-1 min-w-0">
                            <span class="font-medium text-gray-900 block break-words">Section ${section.sectionName} - ${section.roomName || 'TBA'}</span>
                            <p class="text-sm text-gray-600 break-words">${section.empName}</p>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                            <span class="text-xs text-gray-500 text-center sm:text-right">
                                ${section.availableSeat}/${section.defaultSeatCapacity} available
                            </span>
                            <button onclick="addCourse('${section.id}')" 
                                    class="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors w-full sm:w-auto">
                                Add Course
                            </button>
                        </div>
                    </div>
                    ${hasLab ? `
                    <div class="mt-3 pt-3 border-t border-gray-200">
                        <div class="bg-green-50 rounded p-2">
                            <div class="flex items-center mb-1">
                                <i class="fas fa-flask text-green-600 mr-2 shrink-0"></i>
                                <span class="text-sm font-medium text-green-800 break-words">Lab: ${section.labName}</span>
                            </div>
                            <p class="text-xs text-green-700 break-words">Room: ${section.labRoomName || 'TBA'}</p>
                            <p class="text-xs text-green-700 break-words">Schedule: ${labScheduleText}</p>
                            <button onclick="addLabCourse('${section.id}')" 
                                    class="mt-2 bg-green-600 text-white px-3 py-2 rounded text-xs hover:bg-green-700 transition-colors w-full sm:w-auto">
                                Add Lab Only
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>`;
    }).join('');
    
    // Single innerHTML update
    card.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 space-y-2 sm:space-y-0">
            <div class="flex-1 min-w-0">
                <h3 class="text-lg font-bold text-gray-900 truncate">${courseCode}</h3>
                <p class="text-sm text-gray-600 break-words">${courseTitle}</p>
            </div>
            <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded self-start sm:self-auto shrink-0">
                ${firstSection.courseCredit} Credits
            </span>
        </div>
        
        <div class="space-y-1 sm:space-y-2 mb-4">
            <p class="text-sm text-gray-600 flex items-center">
                <i class="fas fa-users text-blue-600 mr-2 shrink-0"></i>
                <span>${sections.length} section(s) available</span>
            </p>
        </div>
        
        <div class="space-y-2">
            ${sectionsHTML}
        </div>
    `;
    
    return card;
}

// Cache object for performance optimization
const scheduleCache = new Map();

function parseSchedule(schedule) {
    if (!schedule) return 'Schedule TBA';
    
    // Use cache to avoid repeated parsing
    if (scheduleCache.has(schedule)) {
        return scheduleCache.get(schedule);
    }
    
    const separator = schedule.includes('\n') ? '\n' : ',';
    const days = schedule.split(separator).map(day => {
        const match = day.match(/(\w+)\((.+)\)/);
        if (match) {
            const dayName = match[1];
            const timeRoom = match[2];
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            if (timeMatch) {
                const formattedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();
                return `${formattedDay} ${timeMatch[1]}-${timeMatch[2]}`;
            }
        }
        return day;
    });
    
    const result = days.join(', ');
    scheduleCache.set(schedule, result);
    return result;
}

function extractRoomFromSchedule(schedule) {
    if (!schedule) return 'TBA';
    
    // Extract room number from new schedule format
    // Example: "Sunday(08:00 AM-09:20 AM-10B-18C),Tuesday(08:00 AM-09:20 AM-10B-18C)"
    const match = schedule.match(/-([^,)]+)\)/);
    return match ? match[1] : 'TBA';
}

function addCourse(courseId) {
    const course = courseData.find(c => c.id == courseId);
    if (!course) return;
    
    // Check if regular course is already selected
    if (selectedCourses.find(c => c.id == courseId && !c.isLabOnly)) {
        showNotification('This course is already selected!', 'error');
        return;
    }
    
    // Generate email from faculty short name
    let email = 'instructor@bracu.ac.bd';
    if (course.empShortName && course.empShortName !== 'TBA') {
        email = `${course.empShortName.toLowerCase()}@bracu.ac.bd`;
    }
    
    // Add editable fields to the course (regular class only)
    const editableCourse = {
        ...course,
        editableCourseName: course.courseCode,
        editableCourseTitle: course.courseTitle,
        editableFacultyName: course.empName,
        editableRoomNumber: course.roomName || extractRoomFromSchedule(course.classSchedule),
        editableInstructorEmail: email,
        eventType: 'normal', // Regular class, not lab
        isLabOnly: false
        // Note: using course.classSchedule (not classLabSchedule) for regular classes
    };
    
    selectedCourses.push(editableCourse);
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    
    // Show success message
    showNotification('Course added successfully!', 'success');
}

function addLabCourse(courseId) {
    const course = courseData.find(c => c.id == courseId);
    if (!course) return;
    
    // Check if lab course is already selected
    if (selectedCourses.find(c => c.id == courseId && c.isLabOnly)) {
        showNotification('This lab is already selected!', 'error');
        return;
    }
    
    // Generate email from faculty short name
    let email = 'instructor@bracu.ac.bd';
    if (course.empShortName && course.empShortName !== 'TBA') {
        email = `${course.empShortName.toLowerCase()}@bracu.ac.bd`;
    }
    
    // Add editable fields to the lab course
    const editableLabCourse = {
        ...course,
        editableCourseName: course.labName ? course.courseCode : course.courseCode + '_Lab',
        editableCourseTitle: course.labName || course.courseTitle + ' Lab',
        editableFacultyName: course.empName,
        editableRoomNumber: course.labRoomName || 'Lab TBA',
        editableInstructorEmail: email,
        eventType: 'lab',
        isLabOnly: true,
        classSchedule: course.classLabSchedule // Use lab schedule instead of regular schedule
    };
    
    selectedCourses.push(editableLabCourse);
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    
    // Show success message
    showNotification('Lab course added successfully!', 'success');
}

// Optimized selected courses display
function updateSelectedCoursesDisplay() {
    const container = document.getElementById('selectedCoursesList');
    const section = document.getElementById('selectedCourses');
    
    if (selectedCourses.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    selectedCourses.forEach((course, index) => {
        const courseElement = createSelectedCourseElement(course, index);
        fragment.appendChild(courseElement);
    });
    
    // Single DOM update
    container.innerHTML = '';
    container.appendChild(fragment);
}

function createSelectedCourseElement(course, index) {
    const element = document.createElement('div');
    const isLab = course.isLabOnly;
    element.className = `${isLab ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'} rounded-lg p-3 sm:p-4 border`;
    
    const scheduleText = parseSchedule(course.classSchedule);
    const eventTypeIcon = getEventTypeIcon(course.eventType);
    
    element.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start space-y-3 sm:space-y-0">
            <div class="flex-1 min-w-0">
                <div class="flex flex-col sm:flex-row sm:items-center mb-2 space-y-1 sm:space-y-0">
                    <div class="flex items-center">
                        <i class="${eventTypeIcon} ${isLab ? 'text-green-600' : 'text-blue-600'} mr-2 shrink-0"></i>
                        <h4 class="text-lg font-bold text-gray-900 break-words">${course.editableCourseName}</h4>
                    </div>
                    <span class="ml-0 sm:ml-2 px-2 py-1 ${isLab ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'} text-xs rounded capitalize self-start">
                        ${course.eventType}${isLab ? ' Only' : ''}
                    </span>
                </div>
                <p class="text-gray-700 mb-1 break-words">${course.editableCourseTitle}</p>
                <div class="space-y-1">
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-user text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${course.editableFacultyName}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-door-open text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">Room: ${course.editableRoomNumber}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-envelope text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${course.editableInstructorEmail}</span>
                    </p>
                    <p class="text-sm text-gray-600 flex items-start">
                        <i class="fas fa-clock text-gray-400 mr-2 mt-0.5 shrink-0"></i>
                        <span class="break-words">${scheduleText}</span>
                    </p>
                </div>
            </div>
            <div class="flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 sm:ml-4 shrink-0">
                <button onclick="editCourse(${index})" 
                        class="text-blue-600 hover:text-blue-800 p-2 rounded border border-blue-200 hover:border-blue-300 transition-colors flex-1 sm:flex-none">
                    <i class="fas fa-edit"></i>
                    <span class="ml-1 sm:hidden">Edit</span>
                </button>
                <button onclick="removeCourse(${index})" 
                        class="text-red-600 hover:text-red-800 p-2 rounded border border-red-200 hover:border-red-300 transition-colors flex-1 sm:flex-none">
                    <i class="fas fa-trash"></i>
                    <span class="ml-1 sm:hidden">Remove</span>
                </button>
            </div>
        </div>
    `;
    
    return element;
}

function getEventTypeIcon(eventType) {
    switch(eventType) {
        case 'lab': return 'fas fa-flask';
        case 'exam': return 'fas fa-clipboard-check';
        default: return 'fas fa-chalkboard-teacher';
    }
}

function editCourse(index) {
    currentEditingCourse = index;
    const course = selectedCourses[index];
    
    // Populate modal form
    document.getElementById('editCourseName').value = course.editableCourseName;
    document.getElementById('editCourseTitle').value = course.editableCourseTitle;
    document.getElementById('editFacultyName').value = course.editableFacultyName;
    document.getElementById('editRoomNumber').value = course.editableRoomNumber;
    document.getElementById('editInstructorEmail').value = course.editableInstructorEmail;
    document.getElementById('editEventType').value = course.eventType;
    
    // Show modal
    document.getElementById('courseModal').classList.remove('hidden');
    document.getElementById('courseModal').classList.add('flex');
}

function saveCourseEdit(e) {
    e.preventDefault();
    
    if (currentEditingCourse === null) return;
    
    const course = selectedCourses[currentEditingCourse];
    course.editableCourseName = document.getElementById('editCourseName').value;
    course.editableCourseTitle = document.getElementById('editCourseTitle').value;
    course.editableFacultyName = document.getElementById('editFacultyName').value;
    course.editableRoomNumber = document.getElementById('editRoomNumber').value;
    course.editableInstructorEmail = document.getElementById('editInstructorEmail').value;
    course.eventType = document.getElementById('editEventType').value;
    
    updateSelectedCoursesDisplay();
    saveToLocalStorage();
    closeModalHandler();
    
    showNotification('Course updated successfully!', 'success');
}

function removeCourse(index) {
    showConfirmationModal('Confirm Removal', 'Are you sure you want to remove this course?', 'Remove Course', () => {
        selectedCourses.splice(index, 1);
        updateSelectedCoursesDisplay();
        saveToLocalStorage();
        showNotification('Course removed successfully!', 'success');
    });
}

// Custom confirmation modal to replace browser confirms
function showConfirmationModal(title, message, confirmText, onConfirm, cancelText = 'Cancel') {
    // Remove any existing confirmation modals
    const existingModals = document.querySelectorAll('.confirmation-modal');
    existingModals.forEach(modal => modal.remove());
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 confirmation-modal';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fas fa-question-circle text-yellow-600 mr-2"></i>${title}
            </h3>
            <p class="text-gray-600 mb-6">${message}</p>
            
            <div class="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                <button onclick="closeConfirmationModal(this)" 
                        class="w-full sm:w-auto bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                    ${cancelText}
                </button>
                <button onclick="confirmAndClose(this)" 
                        class="w-full sm:w-auto bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors">
                    ${confirmText}
                </button>
            </div>
        </div>
    `;
    
    // Store the callback function
    modal.onConfirm = onConfirm;
    
    document.body.appendChild(modal);
    
    // Clean up when modal is closed
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeConfirmationModal(modal);
        }
    });
    
    // Add escape key support
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeConfirmationModal(modal);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

function confirmAndClose(button) {
    const modal = button.closest('.confirmation-modal');
    if (modal && modal.onConfirm) {
        modal.onConfirm();
    }
    closeConfirmationModal(modal);
}

function closeConfirmationModal(element) {
    const modal = element.closest ? element.closest('.confirmation-modal') : element;
    if (modal && modal.parentElement) {
        modal.parentElement.removeChild(modal);
    }
}

// Remove the old closeModal function as we now use closeModalHandler

function closeModalHandler() {
    const courseModal = document.getElementById('courseModal');
    if (courseModal) {
        courseModal.classList.add('hidden');
        courseModal.classList.remove('flex');
    }
    currentEditingCourse = null;
}

function resetApplication() {
    showConfirmationModal('Confirm Reset', 'Are you sure you want to reset everything? This will clear all selected courses.', 'Reset Application', () => {
        selectedCourses = [];
        courseData = [];
        currentEditingCourse = null;
        
        // Clear localStorage
        localStorage.removeItem('selectedCourses');
        localStorage.removeItem('courseData');
        localStorage.removeItem('courseDataTimestamp');
        
        // Reset UI and reload fresh data
        updateSelectedCoursesDisplay();
        loadCourseData(); // Automatically reload data after reset
        
        showNotification('Application reset successfully! Reloading course data...', 'info');
    });
}

// Calendar Export Functions

// Export as .ics file (works with Google Calendar, Outlook, Apple Calendar, etc.)
function exportToCalendarFile() {
    if (selectedCourses.length === 0) {
        showNotification('Please select at least one course to export.', 'error');
        return;
    }
    
    const icsContent = generateICSFile();
    downloadICSFile(icsContent, 'BRACU_Schedule.ics');
    
    showNotification('Calendar file downloaded! Import it to your calendar app.', 'success');
    showImportInstructions();
}

// Generate ICS file content for bulk import
function generateICSFile() {
    const events = [];
    
    selectedCourses.forEach(course => {
        const courseEvents = parseScheduleForICS(course);
        events.push(...courseEvents);
    });
    
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Routine2Calendar//BRACU Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:BRACU Schedule',
        'X-WR-TIMEZONE:Asia/Dhaka',
        'X-WR-CALDESC:BRAC University Class Schedule',
        'BEGIN:VTIMEZONE',
        'TZID:Asia/Dhaka',
        'BEGIN:STANDARD',
        'DTSTART:20230101T000000',
        'TZOFFSETFROM:+0600',
        'TZOFFSETTO:+0600',
        'TZNAME:BST',
        'END:STANDARD',
        'END:VTIMEZONE'
    ];
    
    events.forEach(event => {
        icsContent.push(...event);
    });
    
    icsContent.push('END:VCALENDAR');
    
    return icsContent.join('\r\n');
}

// Export to Google Calendar via URL (bulk method)
function exportToGoogleCalendarURL() {
    if (selectedCourses.length === 0) {
        showNotification('Please select at least one course to export.', 'error');
        return;
    }
    
    // Create individual Google Calendar events for each course schedule
    const googleCalendarURLs = [];
    
    selectedCourses.forEach(course => {
        const events = parseScheduleForGoogleURL(course);
        googleCalendarURLs.push(...events);
    });
    
    // Open multiple Google Calendar "add event" tabs with a delay
    showBulkImportModal(googleCalendarURLs);
}

function showBulkImportModal(googleCalendarURLs) {
    // Store URLs globally so we can access them from the modal
    window.pendingGoogleCalendarURLs = googleCalendarURLs;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fab fa-google text-blue-600 mr-2"></i>Import to Google Calendar
            </h3>
            <p class="text-gray-600 mb-4">Ready to import ${googleCalendarURLs.length} events to Google Calendar.</p>
            
            <div class="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4">
                <p class="text-xs text-yellow-700">
                    <i class="fas fa-info-circle mr-1"></i>
                    This will open ${googleCalendarURLs.length} tabs (one for each class session). Your browser may ask to allow popups.
                </p>
            </div>
            
            <div class="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                <p class="text-xs text-red-700 font-medium">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    <strong>Important:</strong> You should allow all the popups opened by this tab for the import to work properly.
                </p>
            </div>
            
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4">
                <p class="text-xs text-blue-700">
                    <i class="fas fa-info-circle mr-1"></i>
                    <strong>Note:</strong> Google Calendar URL import doesn't support automatic reminders. You'll need to set the ${getNotificationTimeText(getNotificationTime())} reminder manually for each event, or use the .ics file method below for automatic reminders.
                </p>
            </div>
            
            <div class="space-y-3">
                <button onclick="openAllGoogleCalendarTabs(window.pendingGoogleCalendarURLs); closeModalAndRemove(this)" 
                        class="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors">
                    <i class="fas fa-calendar-plus mr-2"></i>
                    Import All Events (${googleCalendarURLs.length} events)
                </button>
                
                <button onclick="exportToCalendarFile(); closeModalAndRemove(this)" 
                        class="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors">
                    <i class="fas fa-download mr-2"></i>
                    Download .ics File Instead (Recommended)
                </button>
            </div>
            
            <button onclick="closeModalAndRemove(this)" 
                    class="w-full mt-4 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function openAllGoogleCalendarTabs(urls) {
    if (!Array.isArray(urls)) {
        console.error('URLs must be an array');
        showNotification('Error: Invalid URL format received. Please try again.', 'error');
        return;
    }
    
    if (urls.length === 0) {
        showNotification('No events to export. Please make sure your courses have valid schedules.', 'error');
        return;
    }
    
    // Show confirmation modal instead of browser confirm
    showConfirmationModal(
        'Open Calendar Tabs',
        `This will open ${urls.length} tabs in your browser. Your browser may block some popups, so please allow them when prompted.`,
        'Continue',
        () => {
            // Open tabs with a delay to prevent popup blocking
            urls.forEach((url, index) => {
                setTimeout(() => {
                    window.open(url, '_blank');
                }, index * 750); // 750ms delay between each tab
            });
            
            showNotification(`Opening ${urls.length} Google Calendar tabs...`, 'info');
        }
    );
}





// Export options modal
function showExportOptions() {
    if (selectedCourses.length === 0) {
        showNotification('Please select at least one course to export.', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">Export Your Schedule</h3>
            <p class="text-gray-600 mb-6">Choose how you'd like to export your class schedule:</p>
            
            <div class="space-y-3">
                <button onclick="exportToCalendarFile(); closeModalAndRemove(this)" 
                        class="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-colors text-left">
                    <i class="fas fa-download mr-3"></i>
                    <strong>Download Calendar File (.ics)</strong>
                    <div class="text-sm opacity-90">Best option - Works with all calendar apps</div>
                </button>
                
                <button onclick="exportToGoogleCalendarURL(); closeModalAndRemove(this)" 
                        class="w-full bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors text-left">
                    <i class="fab fa-google mr-3"></i>
                    <strong>Google Calendar Import</strong>
                    <div class="text-sm opacity-90">Creates individual events (opens multiple tabs)</div>
                </button>
                
                <button onclick="copyCalendarText(); closeModalAndRemove(this)" 
                        class="w-full bg-purple-600 text-white p-3 rounded-lg hover:bg-purple-700 transition-colors text-left">
                    <i class="fas fa-copy mr-3"></i>
                    <strong>Copy Schedule Text</strong>
                    <div class="text-sm opacity-90">Copy formatted schedule to clipboard</div>
                </button>
            </div>
            
            <div class="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p class="text-xs text-yellow-700">
                    <i class="fas fa-lightbulb mr-1"></i>
                    <strong>Tip:</strong> The .ics file method is recommended for importing all events at once.
                </p>
            </div>
            
            <button onclick="closeModalAndRemove(this)" 
                    class="w-full mt-4 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors">
                Cancel
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Helper Functions for ICS Export
function parseScheduleForICS(course) {
    const events = [];
    const schedule = course.classSchedule;
    
    if (!schedule) return events;
    
    // Handle both old and new formats
    const separator = schedule.includes('\n') ? '\n' : ',';
    const dayMatches = schedule.split(separator);
    
    dayMatches.forEach(daySchedule => {
        const match = daySchedule.match(/(\w+)\(([^)]+)\)/);
        if (match) {
            const [, dayName, timeRoom] = match;
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            
            if (timeMatch) {
                const [, startTime, endTime] = timeMatch;
                const event = createICSEvent(course, dayName, startTime, endTime);
                events.push(event);
            }
        }
    });
    
    return events;
}
function createICSEvent(course, dayName, startTime, endTime) {
    const eventTypeSuffix = course.eventType === 'lab' ? '_Lab' : 
                           course.eventType === 'exam' ? '_Exam' : '';

    const summary = `${course.editableCourseName}${eventTypeSuffix} (${course.editableRoomNumber})`;
    // Create description with proper line breaks for ICS format
    const descriptionParts = [
        `Course: ${course.editableCourseTitle}`,
        `Instructor: ${course.editableFacultyName}`,
        `Email: ${course.editableInstructorEmail}`,
        `Room: ${course.editableRoomNumber}`,
        `Section: ${course.sectionName}`
    ];
    
    // Join with newlines and escape special characters for ICS format
    let description = descriptionParts.join('\n');
    // Escape commas, semicolons, and backslashes for ICS format
    description = description.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    const location = `BRAC University, Kha 224, Bir Uttam Rafiqul Islam Ave, Dhaka 1212`;

    // Get next occurrence of this day
    const dayNumber = getDayNumber(dayName);
    const today = new Date();
    const nextOccurrence = getNextDayOccurrence(today, dayNumber);

    // Set start and end times
    const startDateTime = new Date(nextOccurrence);
    const endDateTime = new Date(nextOccurrence);

    startDateTime.setHours(...parseTime(startTime));
    endDateTime.setHours(...parseTime(endTime));

    // Generate unique ID
    const uid = `${course.id}-${dayName}-${startDateTime.getTime()}@routine2calendar.com`;

    // Use local time format for better compatibility
    const startLocal = formatDateForICSLocal(startDateTime);
    const endLocal = formatDateForICSLocal(endDateTime);

    // Get notification time from user selection
    const notificationMinutes = getNotificationTime();

    const eventLines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART;TZID=Asia/Dhaka:${startLocal}`,
        `DTEND;TZID=Asia/Dhaka:${endLocal}`,
        `RRULE:FREQ=WEEKLY;COUNT=15`, // 15 weeks semester
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        `CATEGORIES:${course.eventType.toUpperCase()}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE'
    ];

    // Add alarm/reminder if notification time is set
    if (notificationMinutes > 0) {
        eventLines.push(
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:Reminder: ${summary}`,
            `TRIGGER:-PT${notificationMinutes}M`,
            'END:VALARM'
        );
    }

    eventLines.push('END:VEVENT');

    return eventLines;
}

function formatDateForICSLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function parseScheduleForGoogleURL(course) {
    const events = [];
    const schedule = course.classSchedule;
    
    if (!schedule) return events;
    
    // Handle both old and new formats
    const separator = schedule.includes('\n') ? '\n' : ',';
    const dayMatches = schedule.split(separator);
    
    dayMatches.forEach(daySchedule => {
        const match = daySchedule.match(/(\w+)\(([^)]+)\)/);
        if (match) {
            const [, dayName, timeRoom] = match;
            const timeMatch = timeRoom.match(/(\d{1,2}:\d{2} [AP]M)-(\d{1,2}:\d{2} [AP]M)/);
            
            if (timeMatch) {
                const [, startTime, endTime] = timeMatch;
                const url = createGoogleCalendarURL(course, dayName, startTime, endTime);
                events.push(url);
            }
        }
    });
    
    return events;
}
function createGoogleCalendarURL(course, dayName, startTime, endTime) {
    const eventTypeSuffix = course.eventType === 'lab' ? '_Lab' : 
                           course.eventType === 'exam' ? '_Exam' : '';

    const title = `${course.editableCourseName}${eventTypeSuffix} (${course.editableRoomNumber})`;

    // Clean description without reminder text
    const details = `Course: ${course.editableCourseTitle}\nInstructor: ${course.editableFacultyName}\nEmail: ${course.editableInstructorEmail}\nRoom: ${course.editableRoomNumber}`;
    // Use the static address as requested
    const location = 'BRAC University, Kha 224, Bir Uttam Rafiqul Islam Ave, Dhaka 1212';

    // Get next occurrence of this day
    const dayNumber = getDayNumber(dayName);
    const today = new Date();
    const nextOccurrence = getNextDayOccurrence(today, dayNumber);

    // Set start and end times
    const startDateTime = new Date(nextOccurrence);
    const endDateTime = new Date(nextOccurrence);

    startDateTime.setHours(...parseTime(startTime));
    endDateTime.setHours(...parseTime(endTime));

    const startFormatted = formatDateForGoogle(startDateTime);
    const endFormatted = formatDateForGoogle(endDateTime);

    // Get notification time for the reminder parameter
    const notificationMinutes = getNotificationTime();

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${startFormatted}/${endFormatted}`,
        details: details,
        location: location,
        recur: 'RRULE:FREQ=WEEKLY;COUNT=15'
    });

    // Note: Google Calendar URL templates don't reliably support custom reminder times
    // Users will need to set reminders manually after import

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function copyCalendarText() {
    if (selectedCourses.length === 0) {
        showNotification('No courses selected to copy.', 'error');
        return;
    }
    
    let scheduleText = "📅 BRACU Class Schedule\\n\\n";
    
    selectedCourses.forEach((course, index) => {
        scheduleText += `${index + 1}. ${course.editableCourseName}\\n`;
        scheduleText += `   Title: ${course.editableCourseTitle}\\n`;
        scheduleText += `   Instructor: ${course.editableFacultyName}\\n`;
        scheduleText += `   Room: ${course.editableRoomNumber}\\n`;
        scheduleText += `   Schedule: ${parseSchedule(course.classSchedule)}\\n`;
        scheduleText += `   Type: ${course.eventType.charAt(0).toUpperCase() + course.eventType.slice(1)}\\n\\n`;
    });
    
    // Copy to clipboard
    navigator.clipboard.writeText(scheduleText).then(() => {
        showNotification('Schedule copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback: create a text area and select it
        const textArea = document.createElement('textarea');
        textArea.value = scheduleText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Schedule copied to clipboard!', 'success');
    });
}

function downloadICSFile(content, filename) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function formatDateForICS(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatDateForGoogle(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function showImportInstructions() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 class="text-lg font-bold text-gray-900 mb-4">
                <i class="fas fa-info-circle text-blue-600 mr-2"></i>How to Import Your Schedule
            </h3>
            
            <div class="space-y-4 text-sm text-gray-700">
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">💻 Google Calendar:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Go to calendar.google.com</li>
                        <li>Click the gear icon → Settings</li>
                        <li>Click "Import & export" in the left sidebar</li>
                        <li>Select the downloaded .ics file</li>
                    </ol>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">📧 Outlook:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Open Outlook</li>
                        <li>Go to File → Open & Export → Import/Export</li>
                        <li>Choose "Import an iCalendar (.ics) file"</li>
                        <li>Select your downloaded file</li>
                    </ol>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-900 mb-2">🍎 Apple Calendar:</h4>
                    <ol class="list-decimal list-inside space-y-1 ml-4">
                        <li>Double-click the downloaded .ics file</li>
                        <li>Or drag and drop it into Calendar app</li>
                    </ol>
                </div>
            </div>
            
            <button onclick="closeModalAndRemove(this)" 
                    class="w-full mt-6 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                Got it!
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function getDayNumber(dayName) {
    const days = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
    };
    return days[dayName.toLowerCase()] || 0;
}

function getNextDayOccurrence(date, dayNumber) {
    const today = new Date(date);
    const currentDay = today.getDay();
    const daysUntilTarget = (dayNumber - currentDay + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + (daysUntilTarget || 7));
    return targetDate;
}

function parseTime(timeString) {
    const [time, meridiem] = timeString.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    
    let hour24 = hours;
    if (meridiem === 'PM' && hours !== 12) {
        hour24 += 12;
    } else if (meridiem === 'AM' && hours === 12) {
        hour24 = 0;
    }
    
    return [hour24, minutes, 0, 0];
}

// Helper function to get selected notification time
function getNotificationTime() {
    // Get global notification time
    const globalSelector = document.getElementById('globalNotificationTime');
    return globalSelector ? parseInt(globalSelector.value) : 10; // Default to 10 minutes
}

// Helper function to format notification time text
function getNotificationTimeText(minutes) {
    if (minutes === 0) return 'at event time';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) > 1 ? 's' : ''}`;
    return `${Math.floor(minutes / 1440)} day${Math.floor(minutes / 1440) > 1 ? 's' : ''}`;
}

// Utility functions
function closeModalAndRemove(element) {
    document.body.removeChild(element.closest('.fixed'));
}

function showLoading() {
    const loadingState = document.getElementById('loadingState');
    const initialState = document.getElementById('initialState');
    const courseSelection = document.getElementById('courseSelection');
    
    if (loadingState) loadingState.classList.remove('hidden');
    if (initialState) initialState.classList.add('hidden');
    if (courseSelection) courseSelection.classList.add('hidden');
}

function showInitialState() {
    const loadingState = document.getElementById('loadingState');
    const initialState = document.getElementById('initialState');
    const courseSelection = document.getElementById('courseSelection');
    
    if (loadingState) loadingState.classList.add('hidden');
    if (initialState) initialState.classList.remove('hidden');
    if (courseSelection) courseSelection.classList.add('hidden');
    
    // Show appropriate loading state elements
    const autoLoadingIndicator = document.getElementById('autoLoadingIndicator');
    const manualLoadBtn = document.getElementById('manualLoadBtn');
    
    if (autoLoadingIndicator) autoLoadingIndicator.classList.remove('hidden');
    if (manualLoadBtn) manualLoadBtn.classList.add('hidden');
}

function showInitialStateReady() {
    // Show initial state with manual reload option (after auto-load completes)
    const autoLoadingIndicator = document.getElementById('autoLoadingIndicator');
    const manualLoadBtn = document.getElementById('manualLoadBtn');
    
    if (autoLoadingIndicator) autoLoadingIndicator.classList.add('hidden');
    if (manualLoadBtn) manualLoadBtn.classList.remove('hidden');
}

function showCourseSelection() {
    const loadingState = document.getElementById('loadingState');
    const initialState = document.getElementById('initialState');
    const courseSelection = document.getElementById('courseSelection');
    
    if (loadingState) loadingState.classList.add('hidden');
    if (initialState) initialState.classList.add('hidden');
    if (courseSelection) courseSelection.classList.remove('hidden');
}

function showNotification(message, type = 'info') {
    // Prevent showing notifications if the page is not visible or not ready
    if (document.hidden || !isAppInitialized) {
        return;
    }
    
    const notification = document.createElement('div');
    const isMobile = window.innerWidth < 640;
    
    notification.className = `fixed z-50 p-3 sm:p-4 rounded-lg text-white text-sm sm:text-base transition-all duration-300 transform translate-y-0 ${
        isMobile ? 'top-4 left-3 right-3' : 'top-4 right-4'
    } ${type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 'bg-blue-600'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="break-words">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white opacity-70 hover:opacity-100 shrink-0">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Add with animation
    notification.style.transform = 'translateY(-100%)';
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Auto remove after timeout
    const timeout = type === 'error' ? 5000 : (isMobile ? 4000 : 3000);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.transform = 'translateY(-100%)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }, timeout);
}

// Local Storage functions
function saveToLocalStorage() {
    try {
        localStorage.setItem('selectedCourses', JSON.stringify(selectedCourses));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedCourses = localStorage.getItem('selectedCourses');
        const savedData = localStorage.getItem('courseData');
        
        if (savedCourses) {
            selectedCourses = JSON.parse(savedCourses);
            updateSelectedCoursesDisplay();
        }
        
        if (savedData) {
            // Check if cached data is recent (less than 1 hour old)
            const cacheTimestamp = localStorage.getItem('courseDataTimestamp');
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            
            if (cacheTimestamp && parseInt(cacheTimestamp) > oneHourAgo) {
                // Use cached data if it's recent
                courseData = JSON.parse(savedData);
                populateFilters();
                showCourseSelection();
                displayCourses();
            } else {
                // Cache is old, fetch fresh data
                loadCourseData();
            }
        } else {
            // No cached data, automatically load fresh data
            loadCourseData();
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        // If there's an error with cached data, fall back to loading fresh data
        loadCourseData();
    }
}

// Helper function to extract schedule days for caching
function extractScheduleDays(schedule) {
    if (!schedule) return [];
    
    const separator = schedule.includes('\n') ? '\n' : ',';
    const dayMatches = schedule.split(separator);
    const days = [];
    
    dayMatches.forEach(daySchedule => {
        const match = daySchedule.match(/(\w+)\(/);
        if (match) {
            const dayName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
            if (!days.includes(dayName)) {
                days.push(dayName);
            }
        }
    });
    
    return days;
}

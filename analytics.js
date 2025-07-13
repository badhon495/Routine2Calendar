// analytics.js - Privacy-focused analytics
// No personal data collection, only performance metrics

(function() {
    'use strict';
    
    // Check if analytics should run
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.doNotTrack === '1' ||
        navigator.doNotTrack === '1' ||
        navigator.msDoNotTrack === '1') {
        return;
    }

    // Basic page view tracking (anonymous)
    function trackPageView() {
        const data = {
            page: window.location.pathname,
            title: document.title,
            referrer: document.referrer || 'direct',
            userAgent: navigator.userAgent,
            language: navigator.language,
            screen: `${screen.width}x${screen.height}`,
            timestamp: new Date().toISOString()
        };
        
        // Store locally for debugging (no external sending)
        const views = JSON.parse(localStorage.getItem('r2c_analytics') || '[]');
        views.push(data);
        
        // Keep only last 10 entries
        if (views.length > 10) {
            views.shift();
        }
        
        localStorage.setItem('r2c_analytics', JSON.stringify(views));
        console.log('📊 Page view tracked:', data.page);
    }

    // Performance monitoring
    function trackPerformance() {
        if (!('performance' in window)) return;
        
        window.addEventListener('load', function() {
            setTimeout(function() {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (!perfData) return;
                
                const metrics = {
                    loadTime: Math.round(perfData.loadEventEnd - perfData.fetchStart),
                    domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.fetchStart),
                    firstPaint: 0,
                    firstContentfulPaint: 0
                };
                
                // Get paint timings
                const paintTimings = performance.getEntriesByType('paint');
                paintTimings.forEach(function(timing) {
                    if (timing.name === 'first-paint') {
                        metrics.firstPaint = Math.round(timing.startTime);
                    } else if (timing.name === 'first-contentful-paint') {
                        metrics.firstContentfulPaint = Math.round(timing.startTime);
                    }
                });
                
                console.log('⚡ Performance metrics:', metrics);
                
                // Store performance data
                const perf = JSON.parse(localStorage.getItem('r2c_performance') || '[]');
                perf.push({
                    ...metrics,
                    timestamp: new Date().toISOString(),
                    url: window.location.pathname
                });
                
                // Keep only last 5 entries
                if (perf.length > 5) {
                    perf.shift();
                }
                
                localStorage.setItem('r2c_performance', JSON.stringify(perf));
                
                // Log slow loads (> 3 seconds)
                if (metrics.loadTime > 3000) {
                    console.warn('🐌 Slow page load detected:', metrics.loadTime + 'ms');
                }
                
            }, 100);
        });
    }

    // Error tracking
    function trackErrors() {
        window.addEventListener('error', function(event) {
            const errorData = {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: new Date().toISOString(),
                url: window.location.pathname
            };
            
            console.error('🚨 JavaScript error tracked:', errorData);
            
            // Store error data locally
            const errors = JSON.parse(localStorage.getItem('r2c_errors') || '[]');
            errors.push(errorData);
            
            // Keep only last 10 errors
            if (errors.length > 10) {
                errors.shift();
            }
            
            localStorage.setItem('r2c_errors', JSON.stringify(errors));
        });
        
        // Track unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            const errorData = {
                reason: event.reason ? event.reason.toString() : 'Unknown',
                timestamp: new Date().toISOString(),
                url: window.location.pathname,
                type: 'unhandledrejection'
            };
            
            console.error('🚨 Unhandled promise rejection:', errorData);
            
            const errors = JSON.parse(localStorage.getItem('r2c_errors') || '[]');
            errors.push(errorData);
            
            if (errors.length > 10) {
                errors.shift();
            }
            
            localStorage.setItem('r2c_errors', JSON.stringify(errors));
        });
    }

    // Feature usage tracking
    function trackFeatureUsage() {
        // Track export button clicks
        document.addEventListener('click', function(event) {
            if (event.target.id === 'exportBtn' || 
                event.target.closest('#exportBtn')) {
                console.log('📊 Feature used: Export Schedule');
                incrementFeatureCount('export_schedule');
            }
            
            if (event.target.id === 'loadDataBtn' || 
                event.target.closest('#loadDataBtn')) {
                console.log('📊 Feature used: Load Data');
                incrementFeatureCount('load_data');
            }
            
            if (event.target.classList.contains('add-course-btn') ||
                event.target.closest('[onclick*="addCourse"]')) {
                console.log('📊 Feature used: Add Course');
                incrementFeatureCount('add_course');
            }
        });
    }

    function incrementFeatureCount(feature) {
        const features = JSON.parse(localStorage.getItem('r2c_features') || '{}');
        features[feature] = (features[feature] || 0) + 1;
        features.lastUpdated = new Date().toISOString();
        localStorage.setItem('r2c_features', JSON.stringify(features));
    }

    // User journey tracking
    function trackUserJourney() {
        const journey = JSON.parse(localStorage.getItem('r2c_journey') || '[]');
        const sessionStart = new Date().toISOString();
        
        // Track session start
        journey.push({
            event: 'session_start',
            timestamp: sessionStart,
            url: window.location.pathname
        });
        
        // Track when user leaves
        window.addEventListener('beforeunload', function() {
            journey.push({
                event: 'session_end',
                timestamp: new Date().toISOString(),
                url: window.location.pathname,
                duration: Date.now() - new Date(sessionStart).getTime()
            });
            
            // Keep only last 20 journey events
            if (journey.length > 20) {
                journey.splice(0, journey.length - 20);
            }
            
            localStorage.setItem('r2c_journey', JSON.stringify(journey));
        });
    }

    // Export analytics data for debugging
    window.R2C_Analytics = {
        getPageViews: function() {
            return JSON.parse(localStorage.getItem('r2c_analytics') || '[]');
        },
        getPerformance: function() {
            return JSON.parse(localStorage.getItem('r2c_performance') || '[]');
        },
        getErrors: function() {
            return JSON.parse(localStorage.getItem('r2c_errors') || '[]');
        },
        getFeatures: function() {
            return JSON.parse(localStorage.getItem('r2c_features') || '{}');
        },
        getJourney: function() {
            return JSON.parse(localStorage.getItem('r2c_journey') || '[]');
        },
        clear: function() {
            localStorage.removeItem('r2c_analytics');
            localStorage.removeItem('r2c_performance');
            localStorage.removeItem('r2c_errors');
            localStorage.removeItem('r2c_features');
            localStorage.removeItem('r2c_journey');
            console.log('📊 Analytics data cleared');
        }
    };

    // Initialize tracking
    trackPageView();
    trackPerformance();
    trackErrors();
    trackFeatureUsage();
    trackUserJourney();
    
    console.log('📊 Privacy-focused analytics initialized');
    console.log('📊 Access data with: R2C_Analytics.getPageViews(), R2C_Analytics.getPerformance(), etc.');

})();

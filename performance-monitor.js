// performance-monitor.js - Advanced Performance Monitoring
// Privacy-focused, GDPR compliant performance tracking

(function() {
    'use strict';
    
    // Check if monitoring should run
    if (window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' ||
        window.doNotTrack === '1' ||
        navigator.doNotTrack === '1') {
        return;
    }

    const performanceMonitor = {
        // Core Web Vitals tracking
        vitals: {
            fcp: null,
            lcp: null,
            fid: null,
            cls: null,
            ttfb: null
        },
        
        // Initialize performance monitoring
        init() {
            this.trackCoreWebVitals();
            this.trackResourcePerformance();
            this.trackUserInteraction();
            this.trackErrors();
            this.scheduleReporting();
        },
        
        // Track Core Web Vitals
        trackCoreWebVitals() {
            // First Contentful Paint
            if ('performance' in window && 'getEntriesByType' in performance) {
                const paintEntries = performance.getEntriesByType('paint');
                const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
                if (fcpEntry) {
                    this.vitals.fcp = Math.round(fcpEntry.startTime);
                }
            }
            
            // Largest Contentful Paint
            if ('PerformanceObserver' in window) {
                try {
                    const lcpObserver = new PerformanceObserver((list) => {
                        const entries = list.getEntries();
                        const lastEntry = entries[entries.length - 1];
                        this.vitals.lcp = Math.round(lastEntry.startTime);
                    });
                    lcpObserver.observe({entryTypes: ['largest-contentful-paint']});
                } catch (e) {
                    console.warn('LCP monitoring not supported');
                }
                
                // First Input Delay
                try {
                    const fidObserver = new PerformanceObserver((list) => {
                        const entries = list.getEntries();
                        entries.forEach(entry => {
                            this.vitals.fid = Math.round(entry.processingStart - entry.startTime);
                        });
                    });
                    fidObserver.observe({entryTypes: ['first-input']});
                } catch (e) {
                    console.warn('FID monitoring not supported');
                }
                
                // Cumulative Layout Shift
                try {
                    let clsValue = 0;
                    const clsObserver = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            if (!entry.hadRecentInput) {
                                clsValue += entry.value;
                            }
                        }
                        this.vitals.cls = Math.round(clsValue * 1000) / 1000;
                    });
                    clsObserver.observe({entryTypes: ['layout-shift']});
                } catch (e) {
                    console.warn('CLS monitoring not supported');
                }
            }
            
            // Time to First Byte
            window.addEventListener('load', () => {
                if ('performance' in window && 'timing' in performance) {
                    const timing = performance.timing;
                    this.vitals.ttfb = timing.responseStart - timing.navigationStart;
                }
            });
        },
        
        // Track resource loading performance
        trackResourcePerformance() {
            window.addEventListener('load', () => {
                if ('performance' in window && 'getEntriesByType' in performance) {
                    const resources = performance.getEntriesByType('resource');
                    const slowResources = resources.filter(resource => 
                        resource.duration > 1000 // Resources taking more than 1 second
                    );
                    
                    if (slowResources.length > 0) {
                        this.logEvent('slow_resources', {
                            count: slowResources.length,
                            resources: slowResources.map(r => ({
                                name: r.name,
                                duration: Math.round(r.duration),
                                size: r.transferSize || 0
                            }))
                        });
                    }
                }
            });
        },
        
        // Track user interactions
        trackUserInteraction() {
            // Track button clicks
            document.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    const button = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
                    this.logEvent('button_click', {
                        id: button.id || 'unknown',
                        text: button.textContent.trim().substring(0, 50),
                        timestamp: Date.now()
                    });
                }
            });
            
            // Track form submissions
            document.addEventListener('submit', (e) => {
                this.logEvent('form_submit', {
                    formId: e.target.id || 'unknown',
                    timestamp: Date.now()
                });
            });
            
            // Track course exports (custom event)
            document.addEventListener('courseExported', (e) => {
                this.logEvent('course_export', {
                    courses: e.detail.courseCount || 0,
                    format: e.detail.format || 'unknown',
                    timestamp: Date.now()
                });
            });
        },
        
        // Track JavaScript errors
        trackErrors() {
            window.addEventListener('error', (e) => {
                this.logEvent('javascript_error', {
                    message: e.message,
                    filename: e.filename,
                    line: e.lineno,
                    column: e.colno,
                    timestamp: Date.now()
                });
            });
            
            window.addEventListener('unhandledrejection', (e) => {
                this.logEvent('promise_rejection', {
                    reason: e.reason ? e.reason.toString() : 'Unknown',
                    timestamp: Date.now()
                });
            });
        },
        
        // Log events locally (privacy-focused)
        logEvent(eventType, data) {
            const events = JSON.parse(localStorage.getItem('r2c_performance_events') || '[]');
            events.push({
                type: eventType,
                data: data,
                url: window.location.pathname,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 100 events
            if (events.length > 100) {
                events.splice(0, events.length - 100);
            }
            
            localStorage.setItem('r2c_performance_events', JSON.stringify(events));
        },
        
        // Schedule performance reporting
        scheduleReporting() {
            // Report vitals after page load
            window.addEventListener('load', () => {
                setTimeout(() => {
                    this.reportVitals();
                }, 2000); // Wait 2 seconds after load
            });
            
            // Report on page unload
            window.addEventListener('beforeunload', () => {
                this.reportVitals();
            });
        },
        
        // Report Core Web Vitals
        reportVitals() {
            const report = {
                vitals: this.vitals,
                page: window.location.pathname,
                timestamp: new Date().toISOString(),
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                connection: navigator.connection ? {
                    effectiveType: navigator.connection.effectiveType,
                    downlink: navigator.connection.downlink
                } : null
            };
            
            // Store locally for debugging
            localStorage.setItem('r2c_latest_vitals', JSON.stringify(report));
            
            // Log significant performance issues
            if (this.vitals.lcp && this.vitals.lcp > 2500) {
                console.warn('LCP is poor:', this.vitals.lcp + 'ms');
            }
            if (this.vitals.fid && this.vitals.fid > 100) {
                console.warn('FID is poor:', this.vitals.fid + 'ms');
            }
            if (this.vitals.cls && this.vitals.cls > 0.1) {
                console.warn('CLS is poor:', this.vitals.cls);
            }
        },
        
        // Get performance summary for debugging
        getSummary() {
            return {
                vitals: this.vitals,
                events: JSON.parse(localStorage.getItem('r2c_performance_events') || '[]'),
                latestReport: JSON.parse(localStorage.getItem('r2c_latest_vitals') || '{}')
            };
        }
    };
    
    // Initialize monitoring when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => performanceMonitor.init());
    } else {
        performanceMonitor.init();
    }
    
    // Expose for debugging
    window.performanceMonitor = performanceMonitor;
    
})();

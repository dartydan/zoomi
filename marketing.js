// Marketing Page JavaScript with Tailwind CSS

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing marketing page...');

    // Dark mode functionality
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const darkModeToggleMobile = document.getElementById('dark-mode-toggle-mobile');
    const darkModeIcon = document.getElementById('dark-mode-icon');
    const darkModeIconMobile = document.getElementById('dark-mode-icon-mobile');
    
    // Check for saved dark mode preference, system preference, or default to light mode
    const savedDarkMode = localStorage.getItem('darkMode');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let isDarkMode = false;
    
    if (savedDarkMode !== null) {
        // User has explicitly set a preference
        isDarkMode = savedDarkMode === 'true';
    } else {
        // Use system preference if no saved preference
        isDarkMode = systemPrefersDark;
    }
    
    // Apply dark mode on page load if it should be enabled
    if (isDarkMode) {
        document.documentElement.classList.add('dark');
        updateDarkModeIcons(true);
    }
    
    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        if (localStorage.getItem('darkMode') === null) {
            if (e.matches) {
                document.documentElement.classList.add('dark');
                updateDarkModeIcons(true);
            } else {
                document.documentElement.classList.remove('dark');
                updateDarkModeIcons(false);
            }
        }
    });
    
    function updateDarkModeIcons(isDark) {
        if (isDark) {
            darkModeIcon.className = 'fas fa-sun text-lg';
            darkModeIconMobile.className = 'fas fa-sun';
        } else {
            darkModeIcon.className = 'fas fa-moon text-lg';
            darkModeIconMobile.className = 'fas fa-moon';
        }
    }
    
    function toggleDarkMode() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', isDark);
        updateDarkModeIcons(isDark);
        
        // Add a smooth transition effect
        document.documentElement.style.transition = 'all 0.3s ease';
        
        // Remove transition after animation completes
        setTimeout(() => {
            document.documentElement.style.transition = '';
        }, 300);
        
        // Show a subtle notification
        showDarkModeNotification(isDark);
    }
    
    function showDarkModeNotification(isDark) {
        const notification = document.createElement('div');
        notification.className = `fixed bottom-4 right-4 z-50 p-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-full`;
        
        if (isDark) {
            notification.className += ' bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]';
            notification.innerHTML = `
                <div class="flex items-center space-x-2">
                    <i class="fas fa-moon text-[var(--primary)]"></i>
                    <span class="text-sm font-medium">Dark mode enabled</span>
                </div>
            `;
        } else {
            notification.className += ' bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]';
            notification.innerHTML = `
                <div class="flex items-center space-x-2">
                    <i class="fas fa-sun text-[var(--primary)]"></i>
                    <span class="text-sm font-medium">Light mode enabled</span>
                </div>
            `;
        }
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        // Remove after 2 seconds
        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 2000);
    }
    
    // Add event listeners for both toggle buttons
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }
    
    if (darkModeToggleMobile) {
        darkModeToggleMobile.addEventListener('click', toggleDarkMode);
    }

    // Mobile menu functionality
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
        });

        // Close mobile menu when clicking on a nav link
        const mobileNavLinks = mobileMenu.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenu.classList.add('hidden');
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!mobileMenuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
                mobileMenu.classList.add('hidden');
            }
        });
    }

    // Smooth scrolling for internal navigation links
    const navLinks = document.querySelectorAll('.nav-link, a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only prevent default for internal section links (starting with #)
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(href);
                if (targetSection) {
                    targetSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
            // External links (like blog.zoomi.co) will work normally
        });
    });

    // Navbar scroll effects
    const navbar = document.querySelector('nav');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    // Animate elements on scroll
    const animatedElements = document.querySelectorAll('.card, .text-center');
    const animationObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    animatedElements.forEach(element => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        animationObserver.observe(element);
    });

    // Form submission handling for audit demo
    const auditForm = document.getElementById('auditForm');
    if (auditForm) {
        auditForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Get form data
            const email = this.querySelector('#email').value;
            const url = this.querySelector('#url').value;
            
            // Validation
            if (!email || !url) {
                showNotification('Please fill in all required fields.', 'error');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            // URL validation
            try {
                new URL(url);
            } catch {
                showNotification('Please enter a valid website URL.', 'error');
                return;
            }
            
            // Update button state
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
            
            try {
                // Send data to webhook via GET with query parameters
                const webhookUrl = `https://danzoomi.app.n8n.cloud/webhook/ba96e36a-328b-4be6-80ee-ce990120742a?email=${encodeURIComponent(email)}&url=${encodeURIComponent(url)}`;
                const response = await fetch(webhookUrl, {
                    method: 'GET'
                });
                
                if (response.ok) {
                    showNotification('Thank you! Your audit demo request has been submitted successfully.', 'success');
                    this.classList.add('animate-pulse');
                    this.reset();
                    
                    // Remove animation class after animation
                    setTimeout(() => {
                        this.classList.remove('animate-pulse');
                    }, 1000);
                } else {
                    throw new Error('Webhook request failed');
                }
            } catch (error) {
                console.error('Error submitting form:', error);
                showNotification('Sorry, there was an error submitting your request. Please try again.', 'error');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            }
        });
    }

    // Notification system
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl transform transition-all duration-300 translate-x-full`;
        
        // Set notification content and styling based on type
        if (type === 'success') {
            notification.className += ' bg-gradient-to-r from-green-500 to-green-600 text-white';
            notification.innerHTML = `
                <div class="flex items-center space-x-3">
                    <i class="fas fa-check-circle text-xl"></i>
                    <span class="font-semibold">${message}</span>
                </div>
            `;
        } else {
            notification.className += ' bg-gradient-to-r from-red-500 to-red-600 text-white';
            notification.innerHTML = `
                <div class="flex items-center space-x-3">
                    <i class="fas fa-exclamation-circle text-xl"></i>
                    <span class="font-semibold">${message}</span>
                </div>
            `;
        }
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }

    // Parallax effect for hero section
    const hero = document.querySelector('#home');
    if (hero) {
        window.addEventListener('scroll', function() {
            const scrolled = window.pageYOffset;
            const rate = scrolled * -0.5;
            hero.style.transform = `translateY(${rate}px)`;
        });
    }

    // Interactive card hover effects
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });

    // Add loading animation
    window.addEventListener('load', function() {
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.5s ease';
        
        setTimeout(() => {
            document.body.style.opacity = '1';
        }, 100);
    });

    // Stats counter animation
    const stats = document.querySelectorAll('#about .text-4xl, #about .text-5xl');
    const statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const stat = entry.target;
                const finalValue = stat.textContent;
                const isPlus = finalValue.includes('+');
                const numericValue = parseInt(finalValue.replace(/[^\d]/g, ''));
                
                animateNumber(stat, 0, numericValue, isPlus);
                statsObserver.unobserve(stat);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => {
        statsObserver.observe(stat);
    });

    function animateNumber(element, start, end, isPlus) {
        const duration = 2000;
        const startTime = performance.now();
        
        function updateNumber(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function for smooth animation
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const currentValue = Math.floor(start + (end - start) * easeOutQuart);
            
            let displayValue = currentValue.toString();
            if (isPlus) displayValue += '+';
            
            element.textContent = displayValue;
            
            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            }
        }
        
        requestAnimationFrame(updateNumber);
    }

    // Add some interactive elements
    const serviceIcons = document.querySelectorAll('.card .w-16');
    serviceIcons.forEach(icon => {
        icon.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) rotate(5deg)';
        });
        
        icon.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    });

    // Floating circle mouse avoidance
    const floatingCircles = document.querySelectorAll('.floating-circle-1, .floating-circle-2, .floating-circle-3');
    let mouseX = 0;
    let mouseY = 0;
    
    // Track mouse position globally
    document.addEventListener('mousemove', function(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        // Update circle positions based on mouse
        floatingCircles.forEach(circle => {
            const rect = circle.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Calculate distance from mouse to circle center
            const deltaX = mouseX - centerX;
            const deltaY = mouseY - centerY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Avoid mouse if it's close (within 120px)
            if (distance < 120) {
                const avoidStrength = Math.max(0, (120 - distance) / 120); // Stronger avoidance when closer
                const avoidX = (deltaX / distance) * 30 * avoidStrength;
                const avoidY = (deltaY / distance) * 30 * avoidStrength;
                
                // Use CSS custom properties for smooth avoidance
                circle.style.setProperty('--avoid-x', `${-avoidX}px`);
                circle.style.setProperty('--avoid-y', `${-avoidY}px`);
            } else {
                // Return to normal floating animation
                circle.style.setProperty('--avoid-x', '0px');
                circle.style.setProperty('--avoid-y', '0px');
            }
        });
    });

    console.log('Marketing page initialized successfully!');
}); 
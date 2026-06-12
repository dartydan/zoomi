// Marketing Page JavaScript with Tailwind CSS

// Glyph Animation Class
class GlyphAnimation {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        this.glyph = null;
        this.targetRotation = { x: 0, y: 0 };
        this.currentRotation = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        
        this.init();
        this.setupEvents();
        this.animate();
    }
    
    init() {
        console.log('Initializing Three.js scene...');
        
        // Setup renderer with proper pixel ratio
        const pixelRatio = window.devicePixelRatio;
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
        this.renderer.setClearColor(0x000000, 0);
        
        // Setup camera
        this.camera.position.set(2, 2, 3);
        this.camera.lookAt(0, 0, 0);
        
        console.log('Renderer and camera setup complete');
        
        // Initial resize to ensure proper dimensions
        this.handleResize();
        
        // Create glyph geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        
        // Parameters
        const outerRadius = 1.2;
        const innerRadius = 0.6;
        const segments = 24;
        const layers = 3;
        const layerSpacing = 0.2;
        
        // Create layered circular pattern
        for (let layer = 0; layer < layers; layer++) {
            const layerZ = layer * layerSpacing;
            const currentRadius = outerRadius - (layer * 0.2);
            
            // Outer circle for each layer
            for (let i = 0; i < segments; i++) {
                const theta1 = (i / segments) * Math.PI * 2;
                const theta2 = ((i + 1) / segments) * Math.PI * 2;
                
                vertices.push(
                    Math.cos(theta1) * currentRadius, Math.sin(theta1) * currentRadius, layerZ,
                    Math.cos(theta2) * currentRadius, Math.sin(theta2) * currentRadius, layerZ
                );
                
                // Add connecting spokes
                if (layer < layers - 1) {
                    vertices.push(
                        Math.cos(theta1) * currentRadius, Math.sin(theta1) * currentRadius, layerZ,
                        Math.cos(theta1) * currentRadius, Math.sin(theta1) * currentRadius, layerZ + layerSpacing
                    );
                }
            }
            
            // Create hexagonal pattern
            const innerPoints = 6;
            for (let i = 0; i < innerPoints; i++) {
                const theta1 = (i / innerPoints) * Math.PI * 2;
                const theta2 = ((i + 1) / innerPoints) * Math.PI * 2;
                const r = innerRadius - (layer * 0.1);
                
                vertices.push(
                    Math.cos(theta1) * r, Math.sin(theta1) * r, layerZ,
                    Math.cos(theta2) * r, Math.sin(theta2) * r, layerZ,
                    0, 0, layerZ,
                    Math.cos(theta1) * r, Math.sin(theta1) * r, layerZ
                );
                
                // Add diagonal connectors
                if (i % 2 === 0) {
                    vertices.push(
                        Math.cos(theta1) * r, Math.sin(theta1) * r, layerZ,
                        Math.cos(theta1) * currentRadius, Math.sin(theta1) * currentRadius, layerZ
                    );
                }
            }
        }
        
        // Add central connecting lines
        for (let i = 0; i < 6; i++) {
            const theta = (i / 6) * Math.PI * 2;
            vertices.push(
                0, 0, 0,
                Math.cos(theta) * outerRadius * 0.7, Math.sin(theta) * outerRadius * 0.7, layers * layerSpacing
            );
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        console.log('Creating materials...');
        
        // Create materials with brighter colors and thicker lines
        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0xff99dd,
            linewidth: 4,
            transparent: true,
            opacity: 0.4
        });

        const mainMaterial = new THREE.LineBasicMaterial({
            color: 0xff3399, // Brighter primary color
            linewidth: 3,
            transparent: true,
            opacity: 1
        });

        // Create glow effect
        const glowMesh = new THREE.LineSegments(geometry, glowMaterial);
        glowMesh.scale.multiplyScalar(1.1);
        this.scene.add(glowMesh);
        this.glowMesh = glowMesh;
        
        // Create main mesh
        this.glyph = new THREE.LineSegments(geometry, mainMaterial);
        this.scene.add(this.glyph);
        
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Add point light
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);
    }
    
    handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const pixelRatio = window.devicePixelRatio;

        this.canvas.width = width * pixelRatio;
        this.canvas.height = height * pixelRatio;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    setupEvents() {
        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.targetRotation.y = this.mouse.x * Math.PI / 3;
            this.targetRotation.x = this.mouse.y * Math.PI / 3;
        });
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Smooth rotation
        this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.05;
        this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.05;
        
        if (this.glyph && this.glowMesh) {
            const time = Date.now() * 0.001;
            
            // Update main glyph with more dynamic rotation
            this.glyph.rotation.x = this.currentRotation.x + Math.sin(time * 0.5) * 0.1;
            this.glyph.rotation.y = this.currentRotation.y + Math.cos(time * 0.3) * 0.1;
            this.glyph.rotation.z += 0.002;
            
            // Add slight position animation
            this.glyph.position.y = Math.sin(time) * 0.1;
            
            // Sync glow mesh
            this.glowMesh.rotation.copy(this.glyph.rotation);
            this.glowMesh.position.copy(this.glyph.position);
            
            // Enhanced glow effect
            const pulseScale = 1.15 + Math.sin(time * 2) * 0.1;
            this.glowMesh.scale.setScalar(pulseScale);
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize animation when the page loads
window.addEventListener('load', function() {
    console.log('Page loaded, initializing Three.js animation...');
    
    // Initialize Glyph Animation
    const canvas = document.getElementById('glyphCanvas');
    console.log('Canvas element:', canvas);
    console.log('Canvas dimensions:', canvas.clientWidth, 'x', canvas.clientHeight);
    
    if (canvas) {
        try {
            window.glyphAnimation = new GlyphAnimation(canvas);
            console.log('Animation initialized successfully');
        } catch (error) {
            console.error('Error initializing animation:', error);
            console.error('Error details:', error.stack);
        }
    } else {
        console.error('Canvas element not found!');
    }
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
        console.log('Audit form found and event listener added');
        auditForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Form submission triggered');
            
            // Get form data
            const email = this.querySelector('#email').value;
            const url = this.querySelector('#url').value;
            console.log('Form data:', { email, url });
            
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
                console.log('Submitting to webhook:', webhookUrl);
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
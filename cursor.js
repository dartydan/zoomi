// Shared CSS-based 3D Cursor for all ZOOMI pages
class Cursor3D {
    constructor() {
        console.log('Initializing CSS 3D Cursor...');
        this.createCursor();
        this.addEventListeners();
    }
    
    createCursor() {
        // Create main cursor
        this.cursor = document.createElement('div');
        this.cursor.id = 'css-cursor';
        this.cursor.innerHTML = `
            <div class="cursor-core"></div>
            <div class="cursor-ring"></div>
            <div class="cursor-glow"></div>
            <div class="cursor-particles"></div>
        `;
        document.body.appendChild(this.cursor);
        
        // Create CSS styles
        const style = document.createElement('style');
        style.textContent = `
            #css-cursor {
                position: fixed;
                width: 20px;
                height: 20px;
                pointer-events: none !important;
                z-index: 9999;
                mix-blend-mode: difference;
                transition: transform 0.1s ease;
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                touch-action: none;
                will-change: transform;
            }
            
            .cursor-core {
                position: absolute;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle, #ff3366 0%, #ff6b6b 100%);
                border-radius: 50%;
                box-shadow: 0 0 20px rgba(255, 51, 102, 0.8);
                animation: pulse 2s ease-in-out infinite;
                pointer-events: none !important;
            }
            
            .cursor-ring {
                position: absolute;
                width: 40px;
                height: 40px;
                border: 2px solid #667eea;
                border-radius: 50%;
                top: -10px;
                left: -10px;
                animation: rotate 3s linear infinite;
                opacity: 0.6;
                pointer-events: none !important;
            }
            
            .cursor-glow {
                position: absolute;
                width: 60px;
                height: 60px;
                background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
                border-radius: 50%;
                top: -20px;
                left: -20px;
                animation: glow 2s ease-in-out infinite alternate;
                pointer-events: none !important;
            }
            
            .cursor-particles {
                position: absolute;
                width: 100px;
                height: 100px;
                top: -40px;
                left: -40px;
                pointer-events: none !important;
            }
            
            .cursor-particles::before,
            .cursor-particles::after {
                content: '';
                position: absolute;
                width: 4px;
                height: 4px;
                background: #667eea;
                border-radius: 50%;
                animation: particle-float 3s ease-in-out infinite;
                pointer-events: none !important;
            }
            
            .cursor-particles::before {
                top: 20px;
                left: 30px;
                animation-delay: 0s;
            }
            
            .cursor-particles::after {
                top: 60px;
                left: 10px;
                animation-delay: 1.5s;
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            @keyframes glow {
                from { opacity: 0.3; transform: scale(1); }
                to { opacity: 0.6; transform: scale(1.2); }
            }
            
            @keyframes particle-float {
                0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
                50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
            }
            
            #css-cursor.hover {
                transform: scale(1.5);
            }
            
            #css-cursor.hover .cursor-ring {
                animation-duration: 1s;
            }
            
            #css-cursor.hover .cursor-glow {
                animation-duration: 0.5s;
            }
        `;
        document.head.appendChild(style);
        
        console.log('CSS 3D Cursor created');
    }
    
    addEventListeners() {
        // Mouse move with throttling for better performance
        let ticking = false;
        document.addEventListener('mousemove', (e) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    if (this.cursor) {
                        this.cursor.style.left = e.clientX - 10 + 'px';
                        this.cursor.style.top = e.clientY - 10 + 'px';
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
        
        // Mouse enter/leave for hover effects
        const interactiveElements = document.querySelectorAll('a, button, .split, .content, .main-logo, .service-card, .tech-item, .nav-link, .submit-btn, .service-icon, .feature, .about-card, [onclick]');
        
        interactiveElements.forEach(element => {
            // Ensure no default cursor shows through
            element.style.cursor = 'none';
            
            element.addEventListener('mouseenter', () => {
                if (this.cursor) {
                    this.cursor.classList.add('hover');
                }
            });
            
            element.addEventListener('mouseleave', () => {
                if (this.cursor) {
                    this.cursor.classList.remove('hover');
                }
            });
        });
        
        // Hide cursor when leaving window
        document.addEventListener('mouseleave', () => {
            if (this.cursor) {
                this.cursor.style.opacity = '0';
            }
        });
        
        // Show cursor when entering window
        document.addEventListener('mouseenter', () => {
            if (this.cursor) {
                this.cursor.style.opacity = '1';
            }
        });
    }
}

// Initialize cursor when DOM is loaded
let cursor3D;

document.addEventListener('DOMContentLoaded', function() {
    // Only initialize cursor on desktop
    if (window.innerWidth > 768) {
        cursor3D = new Cursor3D();
    }
}); 
// Global variables
let currentSection = 0;
const sections = ['hero', 'journey', 'tech', 'results', 'demo'];
let isAnimating = false;
let messageCount = 0;
let botResponses = 0;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupNavigation();
    setupScrollAnimations();
    startHeroAnimation();
    setupTimelineAnimations();
    animateStats();
    updateProgress();
    initializeDemo();
    animateResultsCounters();
}

// Navigation setup
function setupNavigation() {
    // Nav links click handlers
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('href').substring(1);
            navigateToSection(target);
            updateActiveNav(this);
        });
    });

    // CTA buttons
    document.querySelectorAll('.cta-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const target = this.getAttribute('data-target');
            if (target) {
                navigateToSection(target);
            }
        });
    });

    // Mobile nav toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }

    // Scroll listener for nav updates
    window.addEventListener('scroll', throttle(updateActiveNavOnScroll, 100));
}

function navigateToSection(sectionId) {
    if (isAnimating) return;
    
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    isAnimating = true;
    
    section.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
    
    // Update current section
    currentSection = sections.indexOf(sectionId);
    updateProgress();
    
    setTimeout(() => {
        isAnimating = false;
    }, 1000);
}

function updateActiveNav(activeLink) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    activeLink.classList.add('active');
}

function updateActiveNavOnScroll() {
    const scrollPos = window.scrollY + 100;
    
    sections.forEach((sectionId, index) => {
        const section = document.getElementById(sectionId);
        if (section) {
            const top = section.offsetTop;
            const bottom = top + section.offsetHeight;
            
            if (scrollPos >= top && scrollPos < bottom) {
                currentSection = index;
                updateProgress();
                
                // Update active nav link
                const activeLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
                if (activeLink) {
                    updateActiveNav(activeLink);
                }
            }
        }
    });
}

// Progress bar
function updateProgress() {
    const progress = ((currentSection + 1) / sections.length) * 100;
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}% הושלם`;
    }
}

// Hero section animations
function startHeroAnimation() {
    // Animate stats counter
    animateStats();
    
    // Start chat simulation
    setTimeout(() => {
        simulateWhatsAppChat();
    }, 2000);
    
    // Start bot processing animation
    setTimeout(() => {
        startBotProcessing();
    }, 8000);
}

function animateStats() {
    const stats = document.querySelectorAll('.stat-number');
    
    stats.forEach(stat => {
        const target = parseInt(stat.getAttribute('data-target'));
        let current = 0;
        const increment = target / 60; // 60 frames for smooth animation
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            stat.textContent = Math.floor(current);
        }, 50);
    });
}

function simulateWhatsAppChat() {
    const chatContainer = document.getElementById('hero-chat');
    if (!chatContainer) return;
    
    const messages = [
        { type: 'other', text: 'היי צוות, מה קרה עם הפרויקט?', delay: 0 },
        { type: 'other', text: 'מישהו יכול לעדכן?', delay: 1500 },
        { type: 'user', text: 'אני אבדוק ואעדכן', delay: 3000 },
        { type: 'other', text: 'תודה רבה!', delay: 4000 },
        { type: 'other', text: 'גם אני רוצה לדעת', delay: 4500 },
        { type: 'user', text: '!summary', delay: 6000 },
        { type: 'bot', text: '🤖 מכין סיכום...', delay: 7000 }
    ];
    
    messages.forEach((msg, index) => {
        setTimeout(() => {
            addMessage(chatContainer, msg.text, msg.type);
            
            // Show typing indicator before bot message
            if (msg.type === 'bot' && index === messages.length - 1) {
                showTypingIndicator(true);
                setTimeout(() => {
                    showTypingIndicator(false);
                }, 2000);
            }
        }, msg.delay);
    });
}

function addMessage(container, text, type) {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    container.appendChild(message);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function showTypingIndicator(show) {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        if (show) {
            indicator.classList.add('show');
        } else {
            indicator.classList.remove('show');
        }
    }
}

function startBotProcessing() {
    const processText = document.querySelector('.process-text');
    const loadingProgress = document.querySelector('.loading-progress');
    
    if (processText && loadingProgress) {
        let progress = 0;
        const messages = [
            'מעבד הודעות...',
            'מנתח תוכן...',
            'מכין סיכום...',
            'סיכום מוכן! ✓'
        ];
        
        const interval = setInterval(() => {
            progress += 25;
            loadingProgress.style.width = `${progress}%`;
            
            const messageIndex = Math.floor(progress / 25) - 1;
            if (messageIndex >= 0 && messageIndex < messages.length) {
                processText.textContent = messages[messageIndex];
            }
            
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    processText.textContent = 'הסיכום נשלח לקבוצה!';
                }, 1000);
            }
        }, 800);
    }
}

// Timeline animations
function setupTimelineAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.3 });
    
    document.querySelectorAll('.timeline-item').forEach(item => {
        observer.observe(item);
    });
}

// Comparison table toggle
function toggleComparison() {
    const table = document.getElementById('comparison-table');
    const btn = document.querySelector('.expand-btn');
    
    if (table && btn) {
        const isOpen = table.classList.contains('open');
        
        if (isOpen) {
            table.classList.remove('open');
            btn.innerHTML = '<i class="fas fa-plus"></i> רואה השוואה מפורטת';
        } else {
            table.classList.add('open');
            btn.innerHTML = '<i class="fas fa-minus"></i> הסתר השוואה';
        }
    }
}

// Navigation buttons
function nextSection() {
    if (currentSection < sections.length - 1) {
        currentSection++;
        navigateToSection(sections[currentSection]);
    }
}

function previousSection() {
    if (currentSection > 0) {
        currentSection--;
        navigateToSection(sections[currentSection]);
    }
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextSection();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previousSection();
    }
});

// Scroll-based animations
function setupScrollAnimations() {
    // Animate elements on scroll
    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, { threshold: 0.1 });
    
    // Add elements to observe
    document.querySelectorAll('.solution-card, .learning-card, .phase-item').forEach(el => {
        animateOnScroll.observe(el);
    });
}

// Utility functions
function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function() {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }
}

function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Performance optimizations
function preloadImages() {
    // Preload any images that might be used later
    const images = [
        // Add image paths here if needed
    ];
    
    images.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('Application error:', e.error);
    // Could add user-friendly error reporting here
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    // Clean up any running intervals or timeouts
    // This helps prevent memory leaks
});

// Touch/swipe support for mobile
let touchStartX = null;
let touchStartY = null;

document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (!touchStartX || !touchStartY) return;
    
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    
    // Only handle horizontal swipes that are longer than vertical
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
            // Swipe left (next section in RTL)
            nextSection();
        } else {
            // Swipe right (previous section in RTL)
            previousSection();
        }
    }
    
    touchStartX = null;
    touchStartY = null;
}, { passive: true });

// Tech card expansion functionality
function expandTechCard(card) {
    const isExpanded = card.classList.contains('expanded');
    
    // Close all other cards first
    document.querySelectorAll('.tech-card').forEach(c => {
        if (c !== card) {
            c.classList.remove('expanded');
        }
    });
    
    // Toggle the clicked card
    if (isExpanded) {
        card.classList.remove('expanded');
    } else {
        card.classList.add('expanded');
        
        // Smooth scroll to the card
        setTimeout(() => {
            card.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }, 300);
    }
}

// Enhanced animation for tech section
function setupTechAnimations() {
    // Animate architecture nodes on scroll
    const archObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const nodes = entry.target.querySelectorAll('.arch-node');
                nodes.forEach((node, index) => {
                    setTimeout(() => {
                        node.style.opacity = '0';
                        node.style.transform = 'translateY(30px)';
                        node.style.transition = 'all 0.6s ease';
                        
                        setTimeout(() => {
                            node.style.opacity = '1';
                            node.style.transform = 'translateY(0)';
                        }, 100);
                    }, index * 200);
                });
            }
        });
    }, { threshold: 0.3 });
    
    const archDiagram = document.querySelector('.architecture-diagram');
    if (archDiagram) {
        archObserver.observe(archDiagram);
    }
    
    // Animate tech cards on scroll
    const techObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '0';
                entry.target.style.transform = 'translateY(50px)';
                entry.target.style.transition = 'all 0.6s ease';
                
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, 100);
            }
        });
    }, { threshold: 0.2 });
    
    document.querySelectorAll('.tech-card').forEach(card => {
        techObserver.observe(card);
    });
    
    // Animate challenge cards
    const challengeObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '0';
                    entry.target.style.transform = 'scale(0.8)';
                    entry.target.style.transition = 'all 0.5s ease';
                    
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'scale(1)';
                    }, 50);
                }, index * 150);
            }
        });
    }, { threshold: 0.3 });
    
    document.querySelectorAll('.challenge-card').forEach(card => {
        challengeObserver.observe(card);
    });
}

// Call tech animations setup
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupTechAnimations();
});

// Performance stats animation for tech section
function animatePerfStats() {
    const perfStats = document.querySelectorAll('.perf-number');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const stat = entry.target;
                const finalText = stat.textContent;
                
                // Extract numbers for animation
                if (finalText.includes('123')) {
                    animateNumber(stat, 0, 123, 1000, '');
                } else if (finalText.includes('2s')) {
                    animateDecimal(stat, 0, 2, 800, 's');
                } else if (finalText.includes('1000')) {
                    animateNumber(stat, 0, 1000, 1200, '');
                }
            }
        });
    }, { threshold: 0.5 });
    
    perfStats.forEach(stat => observer.observe(stat));
}

function animateNumber(element, start, end, duration, suffix) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.floor(start + (end - start) * easeOutCubic(progress));
        element.textContent = current + suffix + (end > 100 ? '+' : '');
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function animateDecimal(element, start, end, duration, suffix) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = (start + (end - start) * easeOutCubic(progress)).toFixed(1);
        element.textContent = '<' + current + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Initialize performance stats animation
setTimeout(() => {
    animatePerfStats();
}, 1000);

// Export functions for debugging
// Results Section Functions
function animateResultsCounters() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateNumbers();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    
    const resultsSection = document.querySelector('.results-section');
    if (resultsSection) {
        observer.observe(resultsSection);
    }
}

function animateNumbers() {
    const counters = document.querySelectorAll('.number[data-target]');
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;
        
        const timer = setInterval(() => {
            current += step;
            if (current >= target) {
                counter.textContent = target;
                clearInterval(timer);
            } else {
                counter.textContent = Math.floor(current);
            }
        }, 16);
    });
}

// Demo Section Functions
function initializeDemo() {
    const demoInput = document.getElementById('demo-input');
    if (demoInput) {
        demoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendDemoMessage();
            }
        });
        
        setTimeout(() => {
            addDemoMessage('ברוכים הבאים לדמו האינטראקטיבי! 🚀', 'bot');
            setTimeout(() => {
                addDemoMessage('נסו לכתוב !help כדי לראות את הפקודות הזמינות', 'bot');
            }, 1000);
        }, 1000);
    }
}

function sendDemoMessage() {
    const input = document.getElementById('demo-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    addDemoMessage(message, 'user');
    input.value = '';
    
    messageCount++;
    updateLiveStats();
    
    setTimeout(() => {
        const response = getBotResponse(message);
        addDemoMessage(response, 'bot');
        botResponses++;
        updateLiveStats();
    }, 1000 + Math.random() * 1000);
}

function quickCommand(command) {
    const input = document.getElementById('demo-input');
    input.value = command;
    sendDemoMessage();
}

function addDemoMessage(text, sender) {
    const chatArea = document.getElementById('demo-chat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `demo-message ${sender}`;
    messageDiv.style.cssText = `
        margin: 10px 0;
        padding: 10px 15px;
        border-radius: 15px;
        max-width: 80%;
        word-wrap: break-word;
        ${sender === 'user' ? 
            'background: #dcf8c6; margin-left: auto; text-align: right;' : 
            'background: white; margin-right: auto; text-align: right;'
        }
    `;
    
    messageDiv.innerHTML = `
        <div style="font-size: 0.9rem; line-height: 1.4; color: #333;">
            ${text.replace(/\n/g, '<br>')}
        </div>
        <div style="font-size: 0.7rem; color: #666; margin-top: 5px; text-align: left;">
            ${new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
        </div>
    `;
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function getBotResponse(message) {
    const responses = {
        '!status': '🤖 הבוט פעיל ועובד!\n📊 123+ קבוצות פעילות\n💬 1,247 הודעות היום\n⚡ זמן תגובה: 1.2s',
        '!help': '📋 פקודות זמינות:\n!status - מצב הבוט\n!summary - סיכום הודעות\n!today - סיכום יומי\n!test - בדיקת חיבור',
        '!summary': '📝 סיכום האירועים האחרונים:\n• דיונים על פיתוח הבוט\n• שיתוף רעיונות לשיפורים\n• תיאום פגישות עבודה\n✨ סיכום נוצר באמצעות AI',
        '!today': '📅 סיכום יומי:\n🌅 בוקר: 45 הודעות\n🌇 צהריים: 78 הודעות\n🌙 ערב: 34 הודעות\n💡 נושאים עיקריים: פיתוח, תכנון, עדכונים',
        '!test': '✅ חיבור לAPI פעיל\n🧠 מודל AI: Qwen 2.5 72B\n📡 סטטוס שרת: מעולה\n⚡ זמן תגובה: 0.8s'
    };
    
    const lowerMessage = message.toLowerCase();
    
    if (responses[message]) {
        return responses[message];
    } else if (lowerMessage.includes('שלום') || lowerMessage.includes('היי')) {
        return 'שלום! 👋 איך אני יכול לעזור? נסה !help לרשימת פקודות';
    } else if (lowerMessage.includes('תודה')) {
        return 'בכיף! 😊 אני כאן כדי לעזור';
    } else {
        return `קיבלתי את ההודעה "${message}".\nאני בוט הדמו ויכול לענות על הפקודות הבסיסיות.\nנסה !help למידע נוסף`;
    }
}

function simulateActivity() {
    const messages = [
        'שלום לכולם! איך המצב?',
        'מישהו יכול לעזור עם השאלה הזאת?',
        'תודה רבה על העזרה 🙏',
        '!status',
        'מעולה! זה ממש מועיל'
    ];
    
    let i = 0;
    const interval = setInterval(() => {
        if (i >= messages.length) {
            clearInterval(interval);
            return;
        }
        
        addDemoMessage(messages[i], 'user');
        messageCount++;
        
        setTimeout(() => {
            const response = getBotResponse(messages[i]);
            addDemoMessage(response, 'bot');
            botResponses++;
            updateLiveStats();
        }, 800);
        
        i++;
    }, 2000);
    
    updateLiveStats();
}

function simulateBotResponse() {
    const aiResponses = [
        '🤖 מעבד נתונים...',
        '📊 מכין סיכום של השיחות האחרונות...',
        '✨ סיכום מוכן!\n\nהנושאים העיקריים:\n• פיתוח פיצ\'רים חדשים\n• תיקון באגים\n• תיאום משימות\n\nמצב כללי: חיובי 😊'
    ];
    
    aiResponses.forEach((response, i) => {
        setTimeout(() => {
            addDemoMessage(response, 'bot');
            botResponses++;
            updateLiveStats();
        }, (i + 1) * 1500);
    });
}

function clearDemo() {
    const chatArea = document.getElementById('demo-chat');
    chatArea.innerHTML = '';
    messageCount = 0;
    botResponses = 0;
    updateLiveStats();
    
    setTimeout(() => {
        addDemoMessage('הצ\'אט נוקה! ברוכים הבאים שוב 🧹✨', 'bot');
    }, 500);
}

function updateLiveStats() {
    const msgCountEl = document.getElementById('msg-count');
    const botResponsesEl = document.getElementById('bot-responses');
    const responseTimeEl = document.getElementById('response-time');
    
    if (msgCountEl) msgCountEl.textContent = messageCount;
    if (botResponsesEl) botResponsesEl.textContent = botResponses;
    if (responseTimeEl) {
        const randomTime = (1.0 + Math.random() * 1.5).toFixed(1);
        responseTimeEl.textContent = randomTime + 's';
    }
}

window.presentationApp = {
    navigateToSection,
    nextSection,
    previousSection,
    toggleComparison,
    expandTechCard,
    sendDemoMessage,
    quickCommand,
    simulateActivity,
    simulateBotResponse,
    clearDemo,
    currentSection: () => currentSection,
    sections
};
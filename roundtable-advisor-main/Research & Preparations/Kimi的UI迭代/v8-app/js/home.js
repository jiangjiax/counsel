// ============================================
// 首页交互逻辑 - Home Page Interactions
// ============================================

// 全局状态
let selectedProject = null;
let selectedRound = null;

// ============================================
// 1. 渲染Package三层结构
// ============================================

function renderPackages() {
    const container = document.getElementById('packages-container');
    if (!container) return;

    let html = '';
    
    Object.values(PACKAGES_DATA).forEach(pkg => {
        const projectsArray = Object.values(pkg.projects);
        const isExpanded = projectsArray.length > 0;
        const projectCount = projectsArray.length;
        
        html += `
            <div class="package-section" data-package-id="${pkg.id}">
                <!-- Package Header -->
                <div class="package-header" onclick="toggleProject('${pkg.id}')">
                    <div class="package-info">
                        <span class="package-icon">${pkg.icon}</span>
                        <div class="package-title-group">
                            <h3 class="package-name">${pkg.name}</h3>
                            <p class="package-desc">${pkg.description}</p>
                        </div>
                    </div>
                    <div class="package-meta">
                        <span class="project-count">${projectCount} 项目</span>
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                    </div>
                </div>
                
                <!-- Projects Container -->
                <div class="projects-container ${isExpanded ? 'expanded' : ''}" id="projects-${pkg.id}">
                    <div class="projects-grid">
                        ${projectsArray.map(project => renderProjectCard(project)).join('')}
                        ${renderNewProjectCard(pkg.id)}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 渲染单个Project卡片
function renderProjectCard(project) {
    const roundCount = project.rounds.length;
    const lastRound = project.rounds[roundCount - 1];
    const lastDate = lastRound ? formatDate(lastRound.date) : '无记录';
    const hasActiveRound = project.rounds.some(r => r.status === 'active');
    
    // 生成round圆点指示器
    const roundDots = project.rounds.map((round, index) => {
        const dotClass = round.status === 'active' ? 'active' : 
                        round.status === 'completed' ? 'completed' : 'pending';
        return `<span class="round-dot ${dotClass}" title="Round ${index + 1}: ${round.title}"></span>`;
    }).join('');
    
    return `
        <div class="project-card ${hasActiveRound ? 'has-active' : ''}" 
             data-project-id="${project.id}"
             onclick="selectProject('${project.id}')">
            <div class="project-header">
                <h4 class="project-name">${project.name}</h4>
                ${hasActiveRound ? '<span class="active-badge">进行中</span>' : ''}
            </div>
            <div class="project-meta">
                <span class="last-date">最后: ${lastDate}</span>
                <div class="round-dots">
                    ${roundDots}
                    ${roundCount === 0 ? '<span class="no-rounds">未开始</span>' : ''}
                </div>
            </div>
        </div>
    `;
}

// 渲染新建Project卡片
function renderNewProjectCard(packageId) {
    return `
        <div class="project-card new-project-card" onclick="createNewProject('${packageId}')">
            <div class="new-project-content">
                <span class="new-icon">+</span>
                <span class="new-text">新建 Project</span>
            </div>
        </div>
    `;
}

// ============================================
// 2. 展开/收起Package
// ============================================

function toggleProject(packageId) {
    const container = document.getElementById(`projects-${packageId}`);
    const section = document.querySelector(`[data-package-id="${packageId}"]`);
    const icon = section?.querySelector('.expand-icon');
    
    if (container) {
        const isExpanded = container.classList.contains('expanded');
        
        if (isExpanded) {
            container.classList.remove('expanded');
            container.style.maxHeight = '0';
            icon?.classList.remove('expanded');
        } else {
            container.classList.add('expanded');
            container.style.maxHeight = container.scrollHeight + 'px';
            icon?.classList.add('expanded');
        }
    }
}

// ============================================
// 3. 选择Project
// ============================================

function selectProject(projectId) {
    // 移除之前的高亮
    document.querySelectorAll('.project-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // 高亮当前选中的project
    const card = document.querySelector(`[data-project-id="${projectId}"]`);
    if (card) {
        card.classList.add('selected');
    }
    
    // 查找project数据
    let project = null;
    for (const pkg of Object.values(PACKAGES_DATA)) {
        const projectsArray = Object.values(pkg.projects);
        project = projectsArray.find(p => p.id === projectId);
        if (project) break;
    }
    
    if (project) {
        selectedProject = project;
        selectedRound = null;
        
        // 启用底部进入按钮
        updateEnterButton(true);
        
        // 显示Round选择弹窗
        showRoundModal(project);
    }
}

// 更新进入按钮状态
function updateEnterButton(enabled) {
    const btn = document.getElementById('enter-btn');
    if (btn) {
        btn.disabled = !enabled;
        btn.classList.toggle('enabled', enabled);
    }
}

// ============================================
// 4. 显示Round选择弹窗
// ============================================

function showRoundModal(project) {
    const modal = document.getElementById('round-modal');
    const header = document.querySelector('#round-modal .modal-header h3');
    const list = document.querySelector('#round-modal .modal-body');
    
    if (!modal || !header || !list) return;
    
    header.textContent = project.name;
    
    let html = '';
    
    // 列出所有rounds
    project.rounds.forEach((round, index) => {
        const isActive = round.status === 'active';
        const isCompleted = round.status === 'completed';
        const statusClass = isActive ? 'active' : isCompleted ? 'completed' : 'pending';
        const statusText = isActive ? '进行中' : isCompleted ? '已完成' : '待开始';
        const progress = round.progress || 0;
        
        html += `
            <div class="round-option ${isActive ? 'has-active' : ''}" 
                 data-round-id="${round.id}"
                 onclick="selectRound('${round.id}')">
                <div class="round-info">
                    <span class="round-number">Round ${index + 1}</span>
                    <span class="round-title">${round.title}</span>
                    <span class="round-date">${formatDate(round.date)}</span>
                </div>
                <div class="round-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${isActive ? `
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <span class="progress-text">${progress}%</span>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    // 添加新建Round选项
    html += `
        <div class="round-option new-round-option" onclick="createNewRound()">
            <div class="round-info">
                <span class="new-round-icon">+</span>
                <span class="new-round-text">新建 Round</span>
            </div>
        </div>
    `;
    
    list.innerHTML = html;
    
    // 显示弹窗
    modal.classList.add('show');
    modal.style.display = 'flex';
}

// 选择Round
function selectRound(roundId) {
    // 移除之前的选择
    document.querySelectorAll('.round-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // 高亮当前选择
    const option = document.querySelector(`[data-round-id="${roundId}"]`);
    if (option) {
        option.classList.add('selected');
    }
    
    // 查找round数据
    if (selectedProject) {
        selectedRound = selectedProject.rounds.find(r => r.id === roundId);
    }
}

// ============================================
// 5. 关闭/确认弹窗
// ============================================

function closeRoundModal() {
    const modal = document.getElementById('round-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 200);
    }
}

function confirmRound() {
    if (selectedRound) {
        closeRoundModal();
        enterSession();
    } else {
        // 提示用户先选择一个round
        showToast('请先选择一个 Round', 'warning');
    }
}

// ============================================
// 6. 创建新Project
// ============================================

function createNewProject(packageId) {
    // 查找package信息
    const pkg = Object.values(PACKAGES_DATA).find(p => p.id === packageId);
    
    // 显示创建弹窗
    const modal = document.getElementById('new-project-modal');
    const packageSelect = document.getElementById('project-package');
    
    if (packageSelect && pkg) {
        packageSelect.value = packageId;
    }
    
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        
        // 聚焦输入框
        setTimeout(() => {
            const input = document.getElementById('project-name');
            if (input) input.focus();
        }, 100);
    }
}

function closeNewProjectModal() {
    const modal = document.getElementById('new-project-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 200);
    }
    
    // 清空输入
    const input = document.getElementById('project-name');
    if (input) input.value = '';
}

function submitNewProject() {
    const nameInput = document.getElementById('project-name');
    const packageSelect = document.getElementById('project-package');
    
    const name = nameInput?.value.trim();
    const packageId = packageSelect?.value;
    
    if (!name) {
        showToast('请输入 Project 名称', 'error');
        return;
    }
    
    // 查找package
    const pkg = Object.values(PACKAGES_DATA).find(p => p.id === packageId);
    if (!pkg) return;
    
    // 创建新project
    const newProject = {
        id: `proj_${Date.now()}`,
        name: name,
        rounds: [],
        createdAt: new Date().toISOString()
    };
    
    // 添加到数据
    pkg.projects[newProject.id] = newProject;
    
    // 重新渲染
    renderPackages();
    
    // 关闭弹窗
    closeNewProjectModal();
    
    // 自动选中新创建的project
    selectProject(newProject.id);
    
    showToast('Project 创建成功', 'success');
}

// 创建新Round
function createNewRound() {
    if (!selectedProject) return;
    
    const roundNumber = selectedProject.rounds.length + 1;
    const newRound = {
        id: `round_${Date.now()}`,
        title: `第 ${roundNumber} 轮对话`,
        date: new Date().toISOString(),
        status: 'active',
        progress: 0,
        messages: [],
        notes: []
    };
    
    selectedProject.rounds.push(newRound);
    selectedRound = newRound;
    
    closeRoundModal();
    enterSession();
    
    showToast('新 Round 已创建', 'success');
}

// ============================================
// 7. 进入Session
// ============================================

function enterSession() {
    if (!selectedProject || !selectedRound) {
        showToast('请先选择 Project 和 Round', 'warning');
        return;
    }
    
    // 隐藏首页
    const homePage = document.getElementById('home');
    if (homePage) {
        homePage.style.display = 'none';
    }
    
    // 显示主应用
    const mainApp = document.getElementById('main');
    if (mainApp) {
        mainApp.style.display = 'flex';
    }
    
    // 根据round状态决定进入哪一步
    const entryStep = determineEntryStep(selectedRound);
    
    // 触发进入session事件
    window.dispatchEvent(new CustomEvent('enterSession', {
        detail: {
            project: selectedProject,
            round: selectedRound,
            entryStep: entryStep
        }
    }));
    
    // 初始化session
    if (typeof initSession === 'function') {
        initSession(selectedProject, selectedRound, entryStep);
    }
}

// 决定进入哪一步
function determineEntryStep(round) {
    if (round.status === 'completed') {
        return 'summary'; // 已完成，显示总结
    }
    
    if (!round.messages || round.messages.length === 0) {
        return 'context'; // 新round，从context开始
    }
    
    // 有消息但未完成，进入对话
    return 'dialogue';
}

// 返回首页
function backToHome() {
    const homePage = document.getElementById('home');
    const mainApp = document.getElementById('main');
    
    if (homePage) homePage.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    
    // 重置选择
    selectedProject = null;
    selectedRound = null;
    
    // 重新渲染以更新状态
    renderPackages();
    updateEnterButton(false);
}

// ============================================
// 工具函数
// ============================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // 今天
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
        return '今天';
    }
    
    // 昨天
    if (diff < 48 * 60 * 60 * 1000 && date.getDate() === now.getDate() - 1) {
        return '昨天';
    }
    
    // 其他日期
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function showToast(message, type = 'info') {
    // 简单的toast提示
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    renderPackages();
    updateEnterButton(false);
    
    // 绑定全局事件
    window.toggleProject = toggleProject;
    window.selectProject = selectProject;
    window.selectRound = selectRound;
    window.closeRoundModal = closeRoundModal;
    window.confirmRound = confirmRound;
    window.createNewProject = createNewProject;
    window.createNewRound = createNewRound;
    window.closeNewProjectModal = closeNewProjectModal;
    window.submitNewProject = submitNewProject;
    window.enterSession = enterSession;
    window.backToHome = backToHome;
});

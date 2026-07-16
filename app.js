import { 
  getAllVideos, 
  getVideoById, 
  saveVideo, 
  updateVideoStatus, 
  deleteVideo 
} from './db.js';

// Application State
let currentFilter = 'all'; // 'all' | 'pending' | 'downloaded' | 'posted'
let currentUser = 'geral'; // 'juliano' | 'dennys' | 'renato' | 'geral'
let selectedVideoFile = null;
let generatedThumbnail = null;
let existingVideoBlob = null;
let existingVideoType = null;
let existingThumbnail = null;

// DOM Elements
const elements = {
  videoGrid: document.getElementById('video-grid'),
  btnAddVideo: document.getElementById('btn-add-video'),
  btnEmptyAdd: document.getElementById('btn-empty-add'),
  btnCloseSlideOver: document.getElementById('btn-close-slide-over'),
  btnCancelForm: document.getElementById('btn-cancel-form'),
  slideOver: document.getElementById('slide-over'),
  slideOverBackdrop: document.getElementById('slide-over-backdrop'),
  slideOverTitle: document.getElementById('slide-over-title'),
  videoForm: document.getElementById('video-form'),
  videoId: document.getElementById('video-id'),
  videoTitleInput: document.getElementById('video-title-input'),
  videoCaptionInput: document.getElementById('video-caption-input'),
  videoScheduleInput: document.getElementById('video-schedule-input'),
  videoStatusSelect: document.getElementById('video-status-select'),
  statusGroup: document.getElementById('status-group'),
  dropzone: document.getElementById('dropzone'),
  videoFileInput: document.getElementById('video-file-input'),
  uploadPreviewContainer: document.getElementById('upload-preview-container'),
  uploadVideoPreview: document.getElementById('upload-video-preview'),
  btnRemoveVideo: document.getElementById('btn-remove-video'),
  searchInput: document.getElementById('search-input'),
  platformFilter: document.getElementById('platform-filter'),
  sortFilter: document.getElementById('sort-filter'),
  videoUrlInput: document.getElementById('video-url-input'),
  capaUrlInput: document.getElementById('capa-url-input'),
  downloadUrlInput: document.getElementById('download-url-input'),
  videoUserSelect: document.getElementById('video-user-select'),
  
  // Stats
  statTotal: document.getElementById('stat-total'),
  statPending: document.getElementById('stat-pending'),
  statDownloaded: document.getElementById('stat-downloaded')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Parse user route first
  parseUserRoute();

  // Initialize Lucide icons
  lucide.createIcons();
  
  // Load data
  await loadAndRenderVideos();

  // Set initial active state to "Total" stats card
  const totalCard = document.querySelector('.stat-card.total');
  if (totalCard) totalCard.classList.add('active');
  
  // Setup Event Listeners
  setupEventListeners();

  // Background interval to check 10-minute timers and update display
  setInterval(async () => {
    let hasUpdates = false;
    try {
      const allVideos = await getAllVideos();
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;

      for (const video of allVideos) {
        const startTimeStr = localStorage.getItem(`video-download-start-${video.id}`);
        if (startTimeStr) {
          const startTime = parseInt(startTimeStr, 10);
          const elapsed = now - startTime;
          
          if (elapsed >= tenMinutes && video.status === 'pending') {
            // Timer expired! Mark as downloaded and promote
            video.status = 'downloaded';
            await updateVideoStatus(video.id, 'downloaded');
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        // Full reload of the grid to update category listings and card layouts
        await loadAndRenderVideos();
      } else {
        // Just update countdown labels in active cards inline to avoid player disruption
        updateActiveCountdowns();
      }
    } catch (e) {
      console.error('Erro no timer de download:', e);
    }
  }, 1000);
});

// Setup All Event Listeners
function setupEventListeners() {
  // Search and Filters change
  elements.searchInput.addEventListener('input', debounce(loadAndRenderVideos, 300));
  elements.platformFilter.addEventListener('change', loadAndRenderVideos);
  elements.sortFilter.addEventListener('change', loadAndRenderVideos);

  // Form Panel opening/closing
  const openPanel = () => {
    resetForm();
    elements.slideOverTitle.textContent = 'Adicionar Novo Vídeo';
    elements.statusGroup.style.display = 'none';
    
    // Auto-select user based on active panel
    if (elements.videoUserSelect) {
      elements.videoUserSelect.value = currentUser;
    }
    elements.slideOver.classList.add('active');
    elements.slideOverBackdrop.classList.add('active');
  };

  const closePanel = () => {
    elements.slideOver.classList.remove('active');
    elements.slideOverBackdrop.classList.remove('active');
    // Clear video element preview src to stop playing
    elements.uploadVideoPreview.src = '';
  };

  elements.btnAddVideo.addEventListener('click', openPanel);
  if (elements.btnEmptyAdd) {
    elements.btnEmptyAdd.addEventListener('click', openPanel);
  }
  elements.btnCloseSlideOver.addEventListener('click', closePanel);
  elements.btnCancelForm.addEventListener('click', closePanel);
  elements.slideOverBackdrop.addEventListener('click', closePanel);

  // Drag-and-Drop / File Upload
  elements.dropzone.addEventListener('click', () => elements.videoFileInput.click());
  elements.videoFileInput.addEventListener('change', handleFileSelect);
  
  elements.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropzone.classList.add('dragover');
  });
  
  elements.dropzone.addEventListener('dragleave', () => {
    elements.dropzone.classList.remove('dragover');
  });
  
  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  elements.btnRemoveVideo.addEventListener('click', () => {
    removeSelectedVideo();
  });

  // Form submit
  elements.videoForm.addEventListener('submit', handleFormSubmit);

  // Handle click on stats metrics cards to trigger navigation/filtering
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach(card => {
    card.addEventListener('click', () => {
      const targetFilter = card.dataset.targetFilter;
      if (!targetFilter) return;
      
      // Toggle active style
      statCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      currentFilter = targetFilter;
      loadAndRenderVideos();
      
      // Scroll to the main dashboard container or grid header
      const mainHeader = document.querySelector('header');
      if (mainHeader) {
        mainHeader.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Handle user switcher dropdown change
  const userSwitcher = document.getElementById('user-switcher');
  if (userSwitcher) {
    userSwitcher.addEventListener('change', (e) => {
      const selectedUser = e.target.value;
      
      // Update browser URL path dynamically (client-side only, no reload)
      window.history.pushState(null, '', selectedUser === 'geral' ? '/' : `/${selectedUser}`);
      
      parseUserRoute();
      loadAndRenderVideos();
    });
  }

  // Handle logo click to return home
  const brandLogo = document.getElementById('brand-logo');
  if (brandLogo) {
    brandLogo.addEventListener('click', () => {
      window.history.pushState(null, '', '/');
      parseUserRoute();
      loadAndRenderVideos();
    });
  }

  // Handle popstate navigation (browser back/forward button clicks)
  window.addEventListener('popstate', () => {
    parseUserRoute();
    loadAndRenderVideos();
  });
}

// Handle File Selection from input or drop
function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    handleFiles(e.target.files);
  }
}

async function handleFiles(files) {
  const file = files[0];
  if (!file.type.startsWith('video/')) {
    showToast('Por favor, selecione apenas arquivos de vídeo.', 'error');
    return;
  }
  
  selectedVideoFile = file;
  
  // Show Preview
  const videoUrl = URL.createObjectURL(file);
  elements.uploadVideoPreview.src = videoUrl;
  elements.dropzone.style.display = 'none';
  elements.uploadPreviewContainer.style.display = 'block';
  
  // Generate Thumbnail automatically in background
  showToast('Processando vídeo e gerando miniatura...', 'info');
  generatedThumbnail = await generateVideoThumbnail(file);
  
  if (generatedThumbnail) {
    showToast('Miniatura gerada com sucesso!', 'success');
  }
  
  // Auto-fill title with filename (without extension) if title is empty
  if (!elements.videoTitleInput.value) {
    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    elements.videoTitleInput.value = nameWithoutExt;
  }
}

function removeSelectedVideo() {
  selectedVideoFile = null;
  generatedThumbnail = null;
  existingVideoBlob = null;
  existingVideoType = null;
  existingThumbnail = null;
  
  // Reset UI
  elements.uploadVideoPreview.src = '';
  elements.uploadPreviewContainer.style.display = 'none';
  elements.dropzone.style.display = 'flex';
  elements.videoFileInput.value = '';
}

// Generate thumbnail using a canvas and HTML5 video
function generateVideoThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    
    video.onloadeddata = () => {
      // Seek to 0.5s or 1s to capture a frame (not the black intro)
      video.currentTime = 0.5;
    };
    
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        resolve(dataUrl);
        URL.revokeObjectURL(video.src);
      } catch (e) {
        console.error('Erro ao processar frame de vídeo:', e);
        resolve(null);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
  });
}

// Reset form fields
function resetForm() {
  elements.videoId.value = '';
  elements.videoForm.reset();
  removeSelectedVideo();
  
  // Clear R2 inputs
  if (elements.videoUrlInput) elements.videoUrlInput.value = '';
  if (elements.capaUrlInput) elements.capaUrlInput.value = '';
  if (elements.downloadUrlInput) elements.downloadUrlInput.value = '';
  if (elements.videoUserSelect) elements.videoUserSelect.value = 'geral';
  
  // Uncheck all platforms
  document.getElementById('platform-tiktok').checked = false;
  document.getElementById('platform-instagram').checked = false;
  document.getElementById('platform-youtube').checked = false;
}

// Handle Form Submission (Add or Edit)
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const id = elements.videoId.value;
  const title = elements.videoTitleInput.value.trim();
  const description = elements.videoCaptionInput.value.trim();
  const scheduledAt = elements.videoScheduleInput.value;
  
  const videoUrl = elements.videoUrlInput.value.trim();
  const capaUrl = elements.capaUrlInput.value.trim();
  const downloadUrl = elements.downloadUrlInput.value.trim();
  
  // Gather checked platforms
  const platforms = [];
  if (document.getElementById('platform-tiktok').checked) platforms.push('tiktok');
  if (document.getElementById('platform-instagram').checked) platforms.push('instagram');
  if (document.getElementById('platform-youtube').checked) platforms.push('youtube');
  
  if (!title) {
    showToast('O título do vídeo é obrigatório.', 'warning');
    return;
  }
  
  // A video file OR a cloud URL is required if we are creating a NEW video
  if (!id && !selectedVideoFile && !videoUrl) {
    showToast('Por favor, faça upload de um vídeo ou insira um Link Público (R2).', 'warning');
    return;
  }
  
  const saveBtn = document.getElementById('btn-save-video');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';
  
  try {
    const user = elements.videoUserSelect ? elements.videoUserSelect.value : 'geral';
    const videoData = {
      title,
      description,
      platforms,
      user,
      scheduledAt,
      videoUrl,
      capaUrl,
      downloadUrl
    };
    
    if (id) {
      videoData.id = id;
      videoData.status = elements.videoStatusSelect.value;
      
      // If a new video file was uploaded, use it. Otherwise, preserve the existing one.
      if (selectedVideoFile) {
        videoData.videoBlob = selectedVideoFile;
        videoData.videoType = selectedVideoFile.type;
        videoData.thumbnail = generatedThumbnail;
      } else {
        videoData.videoBlob = existingVideoBlob;
        videoData.videoType = existingVideoType;
        videoData.thumbnail = existingThumbnail;
      }
    } else {
      videoData.status = 'pending';
      videoData.videoBlob = selectedVideoFile;
      videoData.videoType = selectedVideoFile ? selectedVideoFile.type : '';
      videoData.thumbnail = generatedThumbnail;
      videoData.createdAt = new Date().toISOString();
    }
    
    await saveVideo(videoData);
    
    showToast(id ? 'Vídeo atualizado com sucesso!' : 'Vídeo cadastrado com sucesso!', 'success');
    
    // Close panel
    elements.slideOver.classList.remove('active');
    elements.slideOverBackdrop.classList.remove('active');
    elements.uploadVideoPreview.src = '';
    
    // Reload UI
    await loadAndRenderVideos();
  } catch (error) {
    console.error('Erro ao salvar vídeo:', error);
    showToast('Ocorreu um erro ao salvar o vídeo no IndexedDB.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salvar Vídeo';
  }
}

// Load videos from DB, apply search/filters, update stats, and render grid
async function loadAndRenderVideos() {
  try {
    const statsGrid = document.querySelector('.stats-grid');
    const toolbar = document.querySelector('.toolbar');

    const hashtagsSection = document.getElementById('hashtags-section');

    // Update header Title (h1)
    const titleEl = document.querySelector('header h1');
    if (titleEl) {
      if (currentUser === 'user1') {
        titleEl.textContent = 'Letícia';
      } else if (currentUser === 'user2') {
        titleEl.textContent = 'Jaques';
      } else if (currentUser === 'user3') {
        titleEl.textContent = 'Isis';
      } else if (currentUser === 'hashtags') {
        titleEl.textContent = 'Biblioteca de Hashtags';
      } else {
        titleEl.textContent = 'Organizador de Vídeos';
      }
    }

    if (currentUser === 'hashtags') {
      // Hide dashboard view elements
      if (statsGrid) statsGrid.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      elements.videoGrid.style.display = 'none';
      elements.btnAddVideo.style.display = 'none';
      if (hashtagsSection) hashtagsSection.style.display = 'block';
      
      // Update header description
      const subtitle = document.querySelector('header p');
      if (subtitle) subtitle.textContent = 'Gerencie suas coleções de tags para publicações rápidas';
      
      // Load and render hashtags page content
      await loadAndRenderHashtagsPage();
      return;
    } else {
      // Restore dashboard view elements
      if (statsGrid) statsGrid.style.display = 'grid';
      if (toolbar) toolbar.style.display = 'flex';
      elements.videoGrid.style.display = 'grid';
      elements.btnAddVideo.style.display = 'inline-flex';
      if (hashtagsSection) hashtagsSection.style.display = 'none';
      
      // Restore header description
      const subtitle = document.querySelector('header p');
      if (subtitle) {
        if (currentUser === 'user1') {
          subtitle.textContent = 'Gerencie, prepare e acompanhe as postagens de Letícia';
        } else if (currentUser === 'user2') {
          subtitle.textContent = 'Gerencie, prepare e acompanhe as postagens de Jaques';
        } else if (currentUser === 'user3') {
          subtitle.textContent = 'Gerencie, prepare e acompanhe as postagens de Isis';
        } else {
          subtitle.textContent = 'Gerencie, prepare e acompanhe suas postagens locais';
        }
      }
    }

    let allVideos = await getAllVideos();

    // Auto-populate with user's R2 video if DB is empty
    if (allVideos.length === 0) {
      const demoVideo = {
        title: 'Man_holding_glass_talking_202607122216',
        description: 'Legenda em breve',
        platforms: ['tiktok'],
        user: 'geral',
        status: 'pending',
        videoUrl: 'https://pub-fd82a145c5fd4448ad8db445275e1124.r2.dev/Juliano/Man_holding_glass_talking_202607122216.mp4',
        capaUrl: '',
        downloadUrl: 'Juliano/Man_holding_glass_talking_202607122216.mp4',
        createdAt: new Date().toISOString()
      };
      await saveVideo(demoVideo);
      allVideos = await getAllVideos();
    } else {
      // Force update of the first demo video to use filename as title, keep TikTok only, set user to geral and set description to 'Legenda em breve'
      try {
        const demo = allVideos.find(v => v && v.id === 1);
        if (demo && (demo.title !== 'Man_holding_glass_talking_202607122216' || (demo.platforms && demo.platforms.length > 1) || demo.description !== 'Legenda em breve' || demo.user !== 'geral')) {
          demo.title = 'Man_holding_glass_talking_202607122216';
          demo.platforms = ['tiktok'];
          demo.description = 'Legenda em breve';
          demo.user = 'geral';
          await saveVideo(demo);
          allVideos = await getAllVideos();
        }
      } catch (migError) {
        console.error('Erro na migração do demo:', migError);
      }
    }

    // --- TESTE SEGURO WORKER LETICIA: Injetar arquivos individuais no User 1 ---
    const leticiaFiles = [
      { name: "0702 (1)(3).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0702%20(1)(3).mp4" },
      { name: "0702 (1)(4).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0702%20(1)(4).mp4" },
      { name: "0702 (1)(6).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0702%20(1)(6).mp4" },
      { name: "0702 (1)(8).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0702%20(1)(8).mp4" },
      { name: "0710 (6)(1).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0710%20(6)(1).mp4" },
      { name: "0710 (6)(2).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0710%20(6)(2).mp4" },
      { name: "0710 (6).mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2F0710%20(6).mp4" },
      { name: "Raimundo 1.mp4", url: "https://videoflow-download.dennyssantosst.workers.dev/Leticia%2FRaimundo%201.mp4" }
    ];

    for (const file of leticiaFiles) {
      const existing = allVideos.find(v => v.title === file.name && v.user === 'user1');
      if (!existing) {
        const newVideo = {
          title: file.name,
          description: '',
          platforms: ['tiktok'],
          user: 'user1',
          status: 'pending',
          videoUrl: file.url,
          capaUrl: '',
          downloadUrl: file.url,
          createdAt: new Date().toISOString()
        };
        await saveVideo(newVideo);
      } else if (existing.description === 'Vídeo da pasta Letícia (Cloudflare Worker)') {
        existing.description = '';
        await saveVideo(existing);
      }
    }
    
    // Remove the old HTML folder link if it exists
    const oldFolderLink = allVideos.find(v => v.title === 'Pasta Leticia (Worker)');
    if (oldFolderLink) {
      await deleteVideo(oldFolderLink.id);
    }
    
    allVideos = await getAllVideos();


    // Sync with localStorage (Check if 10 minutes have elapsed since download start)
    try {
      for (const video of allVideos) {
        if (video && video.id) {
          const startTimeStr = localStorage.getItem(`video-download-start-${video.id}`);
          if (startTimeStr && video.status === 'pending') {
            const startTime = parseInt(startTimeStr, 10);
            if (!isNaN(startTime)) {
              const elapsed = Date.now() - startTime;
              const tenMinutes = 10 * 60 * 1000;
              
              if (elapsed >= tenMinutes) {
                video.status = 'downloaded';
                await updateVideoStatus(video.id, 'downloaded');
              }
            }
          }
        }
      }
    } catch (syncError) {
      console.error('Erro no sync com localStorage:', syncError);
    }
    
    // Filter raw list by active user page route first
    if (currentUser !== 'geral') {
      allVideos = allVideos.filter(v => v && v.user === currentUser);
    }

    // Update Stats panel
    updateStats(allVideos);
    
    // Filter videos
    let filteredVideos = allVideos;
    
    // 1. Sidebar status category filter
    if (currentFilter !== 'all') {
      filteredVideos = filteredVideos.filter(v => v.status === currentFilter);
    }
    
    // 2. Search query filter
    const query = elements.searchInput.value.trim().toLowerCase();
    if (query) {
      filteredVideos = filteredVideos.filter(v => 
        v.title.toLowerCase().includes(query) || 
        v.description.toLowerCase().includes(query)
      );
    }
    
    // 3. Platform filter dropdown
    const selectedPlatform = elements.platformFilter.value;
    if (selectedPlatform !== 'all') {
      filteredVideos = filteredVideos.filter(v => v.platforms.includes(selectedPlatform));
    }
    
    // 4. Sort filter
    const sortVal = elements.sortFilter.value;
    if (sortVal === 'newest') {
      filteredVideos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortVal === 'scheduled') {
      filteredVideos.sort((a, b) => {
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return new Date(a.scheduledAt) - new Date(b.scheduledAt);
      });
    } else if (sortVal === 'alphabetical') {
      filteredVideos.sort((a, b) => a.title.localeCompare(b.title));
    }
    
    // Render Grid
    renderGrid(filteredVideos);
    
  } catch (error) {
    console.error('Erro ao renderizar grid de vídeos:', error);
    showToast('Erro ao carregar dados locais.', 'error');
  }
}

// Update stats numbers
function updateStats(videos) {
  const total = videos.length;
  const pending = videos.filter(v => v.status === 'pending').length;
  const downloaded = videos.filter(v => v.status === 'downloaded').length;
  
  elements.statTotal.textContent = total;
  elements.statPending.textContent = pending;
  elements.statDownloaded.textContent = downloaded;
}

// Render video cards inside the grid
function renderGrid(videos) {
  elements.videoGrid.innerHTML = '';
  
  if (videos.length === 0) {
    elements.videoGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="video-off"></i>
        </div>
        <h3>Nenhum vídeo encontrado</h3>
        <p>Não há vídeos registrados correspondentes aos filtros selecionados.</p>
        <button class="btn btn-primary" id="btn-empty-add-dyn">
          <i data-lucide="plus"></i> Cadastrar Novo Vídeo
        </button>
      </div>
    `;
    lucide.createIcons();
    
    const btnEmptyAddDyn = document.getElementById('btn-empty-add-dyn');
    if (btnEmptyAddDyn) {
      btnEmptyAddDyn.addEventListener('click', () => {
        resetForm();
        elements.slideOverTitle.textContent = 'Adicionar Novo Vídeo';
        elements.statusGroup.style.display = 'none';
        elements.slideOver.classList.add('active');
        elements.slideOverBackdrop.classList.add('active');
      });
    }
    return;
  }
  
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.id = video.id;
    
    // Generate platform badges HTML
    const platformBadgesHtml = video.platforms.map(p => {
      let label = p;
      if (p === 'instagram') label = 'Reels';
      if (p === 'youtube') label = 'Shorts';
      return `<span class="platform-badge ${p}">${label}</span>`;
    }).join('');
    
    // Status translation & classes
    let statusClass = 'pending';
    let statusText = 'Não Baixado';
    let downloadBtnLabel = '<i data-lucide="download"></i> Baixar Vídeo';
    let isDownloadedClass = '';
    let btnDisabledAttribute = '';

    // Check if 10-minute download delay timer is currently active
    const startTimeStr = localStorage.getItem(`video-download-start-${video.id}`);
    let isTimerActive = false;
    let countdownText = '';
    
    if (startTimeStr && video.status === 'pending') {
      const startTime = parseInt(startTimeStr, 10);
      const elapsed = Date.now() - startTime;
      const tenMinutes = 10 * 60 * 1000;
      
      if (elapsed < tenMinutes) {
        isTimerActive = true;
        const remainingSecs = Math.ceil((tenMinutes - elapsed) / 1000);
        const minutes = Math.floor(remainingSecs / 60);
        const seconds = remainingSecs % 60;
        countdownText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }

    if (video.status === 'downloaded') {
      statusClass = 'downloaded';
      statusText = 'Baixado';
      downloadBtnLabel = '<i data-lucide="check"></i> Baixar Novamente';
      isDownloadedClass = 'is-downloaded';
    } else if (isTimerActive) {
      statusClass = 'pending timer-active';
      statusText = `Baixando (${countdownText})`;
      downloadBtnLabel = `<i data-lucide="loader-2" class="spin-icon"></i> Será movido para baixado em... ${countdownText}`;
      isDownloadedClass = 'is-downloading';
      btnDisabledAttribute = 'disabled';
    }
    
    // Scheduled date string
    let dateHtml = '';
    if (video.scheduledAt) {
      const dateFormatted = new Date(video.scheduledAt).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      dateHtml = `<span class="video-date"><i data-lucide="calendar" style="width:12px;"></i> ${dateFormatted}</span>`;
    } else {
      dateHtml = `<span>Sem agendamento</span>`;
    }
    
    // Media preview html
    let mediaHtml = '';
    if (video.videoUrl) {
      mediaHtml = `
        <video poster="${video.capaUrl || ''}" preload="metadata">
          <source src="${video.videoUrl}" type="video/mp4">
          Seu navegador não suporta a reprodução deste vídeo.
        </video>
        <div class="video-play-overlay">
          <i data-lucide="play" class="play-icon"></i>
        </div>
      `;
    } else if (video.videoBlob) {
      const localUrl = URL.createObjectURL(video.videoBlob);
      mediaHtml = `
        <video poster="${video.thumbnail || ''}" preload="metadata">
          <source src="${localUrl}" type="${video.videoType || 'video/mp4'}">
        </video>
        <div class="video-play-overlay">
          <i data-lucide="play" class="play-icon"></i>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="no-thumb">
          <i data-lucide="video" class="no-thumb-icon"></i>
          <span>Nenhum vídeo carregado</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="video-card-preview">
        ${mediaHtml}
        <div class="platform-badges">
          ${platformBadgesHtml}
        </div>
        <span class="status-badge ${statusClass}">
          ${statusText}
        </span>
      </div>
      
      <div class="video-card-body">
        <h3 class="video-title" title="${video.title}">${video.title}</h3>
        <p class="video-caption" title="${video.description}">${video.description || '<i>Sem legenda cadastrada.</i>'}</p>
        
        <div class="video-meta">
          ${dateHtml}
          <span>ID: #${video.id}</span>
          ${video.user && video.user !== 'geral' ? `<span class="user-badge" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #34d399; padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize;">${video.user}</span>` : '<span class="user-badge" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--text-secondary); padding: 0.05rem 0.35rem; border-radius: 4px; font-size: 0.7rem;">Geral</span>'}
        </div>
      </div>
      
      <div class="card-actions">
        <button class="btn btn-sm btn-card btn-copy-caption" title="Copiar legenda para postar">
          <i data-lucide="copy" style="width:14px;"></i> Legenda
        </button>
        <button class="btn btn-card btn-download ${isDownloadedClass}" ${btnDisabledAttribute}>
          ${downloadBtnLabel}
        </button>
      </div>
    `;
    
    // Append to container
    elements.videoGrid.appendChild(card);
    
    // Wire actions for this card
    setupCardActions(card, video);
  });
  
  // Re-run Lucide icons mapping
  lucide.createIcons();
}

// Setup event listeners for elements inside a specific video card
function setupCardActions(cardEl, video) {
  // Download Video Action (Automated Mark-as-Downloaded)
  const btnDownload = cardEl.querySelector('.btn-download');
  btnDownload.addEventListener('click', async () => {
    try {
      showToast('Iniciando download do vídeo...', 'info');
      
      if (video.downloadUrl) {
        // Cloud R2/Worker Download Link
        const a = document.createElement('a');
        a.style.display = 'none';
        
        // Auto-construct full URL if user provided R2 key/filename only
        let fullDownloadUrl = video.downloadUrl;
        if (!video.downloadUrl.startsWith('http://') && !video.downloadUrl.startsWith('https://')) {
          const workerBaseUrl = 'https://videoflow-download.dennyssantosst.workers.dev/';
          fullDownloadUrl = `${workerBaseUrl}${video.downloadUrl}`;
        }
        
        a.href = fullDownloadUrl;
        
        const cleanTitle = video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${cleanTitle}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
      } else if (video.videoBlob) {
        // Local Blob Download Link
        let extension = 'mp4';
        if (video.videoType) {
          const parts = video.videoType.split('/');
          if (parts.length > 1) extension = parts[1];
        }
        
        const cleanTitle = video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filename = `${cleanTitle}.${extension}`;
        
        const url = URL.createObjectURL(video.videoBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
      } else {
        showToast('Nenhum arquivo ou link de download disponível.', 'error');
        return;
      }
      
      // Register download start timestamp in localStorage
      localStorage.setItem(`video-download-start-${video.id}`, Date.now().toString());
      
      // Notify download starting with 10-minute timer active
      if (video.status === 'pending') {
        showToast('Download iniciado! O vídeo será liberado em 10 minutos.', 'info');
        await loadAndRenderVideos();
      } else {
        showToast('Download acionado!', 'success');
      }
      
    } catch (e) {
      console.error('Falha no download:', e);
      showToast('Falha ao acionar download do vídeo.', 'error');
    }
  });

  // Copy Caption Action
  const btnCopy = cardEl.querySelector('.btn-copy-caption');
  btnCopy.addEventListener('click', () => {
    if (!video.description) {
      showToast('Este vídeo não possui legenda cadastrada.', 'warning');
      return;
    }
    
    navigator.clipboard.writeText(video.description)
      .then(() => showToast('Legenda copiada para a área de transferência!', 'success'))
      .catch(() => showToast('Erro ao copiar legenda.', 'error'));
  });

  // Toggle Play/Stop Action on Video Custom Overlay
  const videoEl = cardEl.querySelector('video');
  const overlayEl = cardEl.querySelector('.video-play-overlay');
  
  if (videoEl && overlayEl) {
    overlayEl.addEventListener('click', () => {
      if (videoEl.paused) {
        // Pause all other playing videos in the grid
        document.querySelectorAll('.video-card video').forEach(v => {
          if (v !== videoEl) {
            v.pause();
            const card = v.closest('.video-card');
            if (card) {
              const overlay = card.querySelector('.video-play-overlay');
              if (overlay) {
                overlay.innerHTML = '<i data-lucide="play" class="play-icon"></i>';
                overlay.classList.remove('playing');
              }
            }
          }
        });
        
        videoEl.play();
        overlayEl.innerHTML = '<i data-lucide="square" class="stop-icon"></i>';
        overlayEl.classList.add('playing');
        lucide.createIcons();
      } else {
        videoEl.pause();
        videoEl.currentTime = 0; // Stop resets video timeline
        overlayEl.innerHTML = '<i data-lucide="play" class="play-icon"></i>';
        overlayEl.classList.remove('playing');
        lucide.createIcons();
      }
    });
  }
}

// Utility: Debounce for fast searches
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Custom Toast System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle-2';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'error') iconName = 'x-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Refresh Lucide in the toast element
  lucide.createIcons();
  
  // Animation timing
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s ease reverse forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}



// Helper: Updates countdown overlays dynamically for any active 10-minute download queues
function updateActiveCountdowns() {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  document.querySelectorAll('.video-card').forEach(cardEl => {
    const id = parseInt(cardEl.dataset.id, 10);
    const startTimeStr = localStorage.getItem(`video-download-start-${id}`);
    
    if (startTimeStr) {
      const startTime = parseInt(startTimeStr, 10);
      const elapsed = now - startTime;
      
      if (elapsed < tenMinutes) {
        const remainingSecs = Math.ceil((tenMinutes - elapsed) / 1000);
        const minutes = Math.floor(remainingSecs / 60);
        const seconds = remainingSecs % 60;
        const countdownText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update badge
        const badge = cardEl.querySelector('.status-badge');
        if (badge) {
          badge.className = 'status-badge pending timer-active';
          badge.textContent = `Baixando (${countdownText})`;
        }
        
        // Update button
        const button = cardEl.querySelector('.btn-download');
        if (button) {
          button.className = 'btn btn-card btn-download is-downloading';
          button.disabled = true;
          button.innerHTML = `<i data-lucide="loader-2" class="spin-icon" style="width:14px; margin-right:4px;"></i> Será movido para baixado em... ${countdownText}`;
          lucide.createIcons();
        }
      }
    }
  });
}

// Parse URL paths, query parameters, or hashes to resolve the active user
function parseUserRoute() {
  const path = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase();
  const validUsers = ['user1', 'user2', 'user3', 'hashtags'];
  
  if (validUsers.includes(path)) {
    currentUser = path;
  } else {
    // Check query params fallback: ?user=user1
    const params = new URLSearchParams(window.location.search);
    const queryUser = params.get('user')?.toLowerCase();
    if (validUsers.includes(queryUser)) {
      currentUser = queryUser;
    } else {
      // Check hash parameter fallback: #/user1
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (validUsers.includes(hash)) {
        currentUser = hash;
      } else {
        currentUser = 'geral';
      }
    }
  }

  // Update Visual Active Panel Badge
  const badgeEl = document.getElementById('active-panel-badge');
  if (badgeEl) {
    badgeEl.style.display = 'none';
  }

  // Update Dropdown Switcher selection value
  const userSwitcher = document.getElementById('user-switcher');
  if (userSwitcher) {
    userSwitcher.value = currentUser;
  }
}

// Load, analyze hashtags frequency from db, and render copy sections
async function loadAndRenderHashtagsPage() {
  try {
    const allVideos = await getAllVideos();
    
    // 1. Calculate tag frequencies
    const tagCounts = {};
    allVideos.forEach(video => {
      if (video && video.description) {
        // Regex to match hashtag pattern
        const tags = video.description.match(/#[\wá-ú]+/gi) || [];
        tags.forEach(tag => {
          const lowerTag = tag.toLowerCase();
          tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1;
        });
      }
    });

    // Sort tags by usage frequency
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    // Render tag frequency badges
    const frequencyContainer = document.getElementById('active-tags-frequency');
    if (frequencyContainer) {
      frequencyContainer.innerHTML = '';
      if (sortedTags.length === 0) {
        frequencyContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">Nenhuma tag em uso nos vídeos cadastrados.</span>`;
      } else {
        sortedTags.forEach(([tag, count]) => {
          const span = document.createElement('span');
          span.className = 'platform-badge';
          span.style.background = 'rgba(255,255,255,0.05)';
          span.style.border = '1px solid rgba(255,255,255,0.1)';
          span.style.color = 'var(--text-secondary)';
          span.style.cursor = 'pointer';
          span.style.padding = '0.35rem 0.65rem';
          span.style.fontSize = '0.8rem';
          span.style.borderRadius = '6px';
          span.style.display = 'inline-flex';
          span.style.alignItems = 'center';
          span.style.gap = '0.25rem';
          span.innerHTML = `${tag} <strong style="color: var(--accent-primary);">${count}</strong>`;
          
          span.title = 'Clique para copiar esta hashtag';
          span.addEventListener('click', () => {
            navigator.clipboard.writeText(tag)
              .then(() => showToast(`Hashtag ${tag} copiada!`, 'success'))
              .catch(() => showToast('Erro ao copiar.', 'error'));
          });
          frequencyContainer.appendChild(span);
        });
      }
    }

    // 2. Setup standard copy tags buttons
    document.querySelectorAll('.btn-copy-tags').forEach(btn => {
      // Remove any existing clone listeners by recreating buttons
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => {
        const tags = newBtn.dataset.tags;
        navigator.clipboard.writeText(tags)
          .then(() => showToast('Grupo de tags copiado para a área de transferência!', 'success'))
          .catch(() => showToast('Erro ao copiar tags.', 'error'));
      });
    });

    // 3. Setup ready-made captions copy buttons
    document.querySelectorAll('.btn-copy-caption-text').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => {
        const text = newBtn.dataset.targetText;
        navigator.clipboard.writeText(text)
          .then(() => showToast('Legenda copiada para a área de transferência!', 'success'))
          .catch(() => showToast('Erro ao copiar legenda.', 'error'));
      });
    });

    // 4. Click on individual tag-badges to copy
    document.querySelectorAll('.tag-badge').forEach(badge => {
      badge.addEventListener('click', () => {
        const tag = badge.textContent.trim();
        navigator.clipboard.writeText(tag)
          .then(() => showToast(`Hashtag ${tag} copiada!`, 'success'))
          .catch(() => showToast('Erro ao copiar hashtag.', 'error'));
      });
    });

    // 5. Render and handle custom hashtag groups
    renderCustomHashtagGroups();

    // 6. Setup Custom Hashtag Form submission
    const customForm = document.getElementById('custom-hashtag-form');
    if (customForm) {
      customForm.onsubmit = (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('custom-group-name');
        const tagsInput = document.getElementById('custom-group-tags');
        
        if (nameInput && tagsInput) {
          const name = nameInput.value.trim();
          let tags = tagsInput.value.trim();
          
          // Ensure tags start with #
          const formattedTags = tags.split(/\s+/).map(t => t.startsWith('#') ? t : `#${t}`).join(' ');

          if (name && formattedTags) {
            const savedGroups = JSON.parse(localStorage.getItem('custom-hashtag-groups') || '[]');
            savedGroups.push({ id: Date.now(), name, tags: formattedTags });
            localStorage.setItem('custom-hashtag-groups', JSON.stringify(savedGroups));
            
            nameInput.value = '';
            tagsInput.value = '';
            
            showToast('Grupo de hashtags criado com sucesso!', 'success');
            renderCustomHashtagGroups();
          }
        }
      };
    }

    lucide.createIcons();
  } catch (error) {
    console.error('Erro ao renderizar gerenciador de hashtags:', error);
  }
}

// Render custom groups from localStorage
function renderCustomHashtagGroups() {
  const container = document.getElementById('custom-groups-container');
  if (!container) return;

  container.innerHTML = '';
  const savedGroups = JSON.parse(localStorage.getItem('custom-hashtag-groups') || '[]');
  
  if (savedGroups.length === 0) {
    container.innerHTML = `
      <div style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; text-align: center; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">
        Nenhum grupo personalizado criado.
      </div>
    `;
    return;
  }

  savedGroups.forEach(group => {
    const item = document.createElement('div');
    item.className = 'tag-group-item';
    item.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; position: relative; margin-top: 0.5rem;';
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h4 style="font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin: 0;">${group.name}</h4>
        <button class="btn btn-sm btn-delete-group" data-id="${group.id}" style="padding: 2px 6px; background: transparent; border: none; color: #ef4444;" title="Excluir grupo">
          <i data-lucide="trash-2" style="width:14px;"></i>
        </button>
      </div>
      <p class="tag-text" style="color: var(--text-secondary); font-size: 0.8rem; font-family: monospace; word-break: break-all; margin-bottom: 0.75rem;">${group.tags}</p>
      <button class="btn btn-sm btn-copy-custom-tags" data-tags="${group.tags}" style="width: 100%; justify-content: center; background: var(--bg-secondary);">
        <i data-lucide="copy" style="width:14px; margin-right:4px;"></i> Copiar Tags
      </button>
    `;
    
    // Add delete listener
    item.querySelector('.btn-delete-group').addEventListener('click', () => {
      const updated = savedGroups.filter(g => g.id !== group.id);
      localStorage.setItem('custom-hashtag-groups', JSON.stringify(updated));
      showToast('Grupo de hashtags excluído.', 'info');
      renderCustomHashtagGroups();
    });

    // Add copy listener
    item.querySelector('.btn-copy-custom-tags').addEventListener('click', () => {
      navigator.clipboard.writeText(group.tags)
        .then(() => showToast(`Grupo "${group.name}" copiado!`, 'success'))
        .catch(() => showToast('Erro ao copiar tags.', 'error'));
    });

    container.appendChild(item);
  });
  
  lucide.createIcons();
}

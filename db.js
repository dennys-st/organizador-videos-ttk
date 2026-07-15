const DB_NAME = 'VideoOrganizerDB';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

let dbInstance = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB initialization failed:', event.target.error);
      reject(event.target.error);
    };
  });
}

export async function getAllVideos() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by creation date or schedule date (newest first)
      const videos = request.result || [];
      videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(videos);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getVideoById(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(Number(id));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveVideo(videoData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const record = {
      title: videoData.title || 'Sem título',
      description: videoData.description || '',
      status: videoData.status || 'pending', // 'pending' | 'downloaded' | 'posted'
      platforms: videoData.platforms || [], // ['tiktok', 'instagram', 'youtube']
      scheduledAt: videoData.scheduledAt || '',
      videoBlob: videoData.videoBlob || null,
      videoType: videoData.videoType || '',
      thumbnail: videoData.thumbnail || null,
      videoUrl: videoData.videoUrl || '',
      capaUrl: videoData.capaUrl || '',
      downloadUrl: videoData.downloadUrl || '',
      createdAt: videoData.createdAt || new Date().toISOString()
    };

    if (videoData.id) {
      record.id = Number(videoData.id);
    }

    const request = store.put(record);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updateVideoStatus(id, status) {
  const video = await getVideoById(id);
  if (!video) throw new Error('Video not found');
  video.status = status;
  return saveVideo(video);
}

export async function deleteVideo(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(Number(id));

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

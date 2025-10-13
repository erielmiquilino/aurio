const DB_NAME = 'aurio-cache';
const STORE_NAME = 'audioChunks';
const DB_VERSION = 1;
const MAX_CACHE_SIZE_MB = 50;
const MAX_CACHE_SIZE_BYTES = MAX_CACHE_SIZE_MB * 1024 * 1024;
const EXPIRATION_DAYS = 7;
const EXPIRATION_MS = EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

type CacheEntry = {
  audio: ArrayBuffer;
  timestamp: number;
  hits: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[TTS][cache] erro ao abrir DB', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      console.log('[TTS][cache] DB aberto');
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log('[TTS][cache] store criado');
      }
    };
  });
  
  return dbPromise;
}

function generateKey(text: string, voiceName: string): string {
  // Simples hash para evitar chaves muito longas
  const combined = `${text}__${voiceName}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${hash}_${combined.length}`;
}

export async function get(text: string, voiceName: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    const key = generateKey(text, voiceName);
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result;
        
        if (!entry) {
          console.log('[TTS][cache] MISS', { key });
          resolve(null);
          return;
        }
        
        // Verificar expiração
        const age = Date.now() - entry.timestamp;
        if (age > EXPIRATION_MS) {
          console.log('[TTS][cache] EXPIRED', { key, ageD: Math.floor(age / (24 * 60 * 60 * 1000)) });
          store.delete(key);
          resolve(null);
          return;
        }
        
        // Incrementar hits
        entry.hits++;
        store.put(entry, key);
        
        console.log('[TTS][cache] HIT', { key, hits: entry.hits, size: entry.audio.byteLength });
        resolve(entry.audio);
      };
      
      request.onerror = () => {
        console.error('[TTS][cache] erro ao buscar', request.error);
        resolve(null);
      };
    });
  } catch (e) {
    console.error('[TTS][cache] erro ao buscar', e);
    return null;
  }
}

export async function set(text: string, voiceName: string, audio: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    const key = generateKey(text, voiceName);
    
    // Verificar tamanho antes de adicionar
    const currentSize = await getSize();
    if (currentSize + audio.byteLength > MAX_CACHE_SIZE_BYTES) {
      console.log('[TTS][cache] evict necessário', { current: currentSize, adding: audio.byteLength, limit: MAX_CACHE_SIZE_BYTES });
      await evictOldest();
    }
    
    const entry: CacheEntry = {
      audio,
      timestamp: Date.now(),
      hits: 0
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry, key);
      
      request.onsuccess = () => {
        console.log('[TTS][cache] SET', { key, size: audio.byteLength });
        resolve();
      };
      
      request.onerror = () => {
        console.error('[TTS][cache] erro ao salvar', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[TTS][cache] erro ao salvar', e);
  }
}

export async function getSize(): Promise<number> {
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      let total = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry: CacheEntry = cursor.value;
          total += entry.audio.byteLength;
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      
      request.onerror = () => {
        console.error('[TTS][cache] erro ao calcular tamanho', request.error);
        resolve(0);
      };
    });
  } catch (e) {
    console.error('[TTS][cache] erro ao calcular tamanho', e);
    return 0;
  }
}

async function evictOldest(): Promise<void> {
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      
      let oldest: { key: IDBValidKey; timestamp: number } | null = null;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry: CacheEntry = cursor.value;
          if (!oldest || entry.timestamp < oldest.timestamp) {
            oldest = { key: cursor.key, timestamp: entry.timestamp };
          }
          cursor.continue();
        } else {
          if (oldest) {
            console.log('[TTS][cache] evict oldest', { key: oldest.key });
            store.delete(oldest.key);
          }
          resolve();
        }
      };
      
      request.onerror = () => {
        console.error('[TTS][cache] erro ao evict', request.error);
        resolve();
      };
    });
  } catch (e) {
    console.error('[TTS][cache] erro ao evict', e);
  }
}

export async function clear(): Promise<void> {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('[TTS][cache] CLEAR OK');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[TTS][cache] erro ao limpar', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    console.error('[TTS][cache] erro ao limpar', e);
  }
}


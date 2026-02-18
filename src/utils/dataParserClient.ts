/**
 * Client interface for data parsing Web Worker
 * Offloads heavy JSON parsing to prevent UI blocking
 */

interface ParseOptions {
  filter?: any;
  onProgress?: (progress: number) => void;
}

interface WorkerRequest {
  type: 'parse' | 'parseGeoJSON' | 'filter';
  data: string;
  filter?: any;
  id: string;
}

interface WorkerResponse {
  type: 'success' | 'error' | 'progress';
  data?: any;
  error?: string;
  progress?: number;
  id: string;
}

class DataParserWorker {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: any) => void;
      reject: (error: Error) => void;
      onProgress?: (progress: number) => void;
    }
  >();

  constructor() {
    if (typeof window !== 'undefined' && window.Worker) {
      this.initWorker();
    }
  }

  /**
   * Initialize the web worker
   */
  private initWorker(): void {
    try {
      // Create worker from inline code for Next.js compatibility
      const workerCode = `
        self.onmessage = (event) => {
          const { type, data, filter, id } = event.data;
          
          try {
            let result;
            
            if (type === 'parse' || type === 'parseGeoJSON') {
              self.postMessage({ type: 'progress', progress: 10, id });
              result = JSON.parse(data);
              self.postMessage({ type: 'progress', progress: 50, id });
              
              if (filter && result.features) {
                const originalCount = result.features.length;
                result.features = result.features.filter(feature => {
                  for (const key in filter) {
                    if (Array.isArray(filter[key])) {
                      if (!filter[key].includes(feature.properties[key])) return false;
                    } else if (feature.properties[key] !== filter[key]) {
                      return false;
                    }
                  }
                  return true;
                });
                console.log(\`Worker: Filtered \${originalCount} -> \${result.features.length} features\`);
              }
              
              self.postMessage({ type: 'progress', progress: 100, id });
            } else if (type === 'filter') {
              result = JSON.parse(data);
              self.postMessage({ type: 'progress', progress: 50, id });
              
              if (result.features && filter) {
                result.features = result.features.filter(feature => {
                  for (const key in filter) {
                    if (feature.properties[key] !== filter[key]) return false;
                  }
                  return true;
                });
              }
              
              self.postMessage({ type: 'progress', progress: 100, id });
            }
            
            self.postMessage({ type: 'success', data: result, id });
          } catch (error) {
            self.postMessage({ 
              type: 'error', 
              error: error.message || String(error), 
              id 
            });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);

      this.worker = new Worker(workerUrl);
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);

      console.log('Data parser worker initialized');
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      this.worker = null;
    }
  }

  /**
   * Handle worker messages
   */
  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const { type, data, error, progress, id } = event.data;
    const request = this.pendingRequests.get(id);

    if (!request) return;

    switch (type) {
      case 'success':
        request.resolve(data);
        this.pendingRequests.delete(id);
        break;

      case 'error':
        request.reject(new Error(error || 'Worker error'));
        this.pendingRequests.delete(id);
        break;

      case 'progress':
        if (request.onProgress && typeof progress === 'number') {
          request.onProgress(progress);
        }
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleError(error: ErrorEvent): void {
    console.error('Worker error:', error);

    // Reject all pending requests
    for (const [, request] of this.pendingRequests) {
      request.reject(new Error('Worker crashed'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Parse JSON string in worker
   */
  async parseJSON(jsonString: string, options: ParseOptions = {}): Promise<any> {
    // Fallback to main thread if worker not available
    if (!this.worker) {
      console.warn('Worker not available, parsing on main thread');
      return JSON.parse(jsonString);
    }

    const id = `${++this.requestId}`;
    const { filter, onProgress } = options;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const request: WorkerRequest = {
        type: 'parse',
        data: jsonString,
        filter,
        id,
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Parse GeoJSON string in worker
   */
  async parseGeoJSON(jsonString: string, options: ParseOptions = {}): Promise<any> {
    // Fallback to main thread if worker not available
    if (!this.worker) {
      console.warn('Worker not available, parsing on main thread');
      const result = JSON.parse(jsonString);

      // Apply filter on main thread if needed
      if (options.filter && result.features) {
        result.features = result.features.filter((feature: any) => {
          for (const key in options.filter) {
            if (feature.properties[key] !== options.filter[key]) {
              return false;
            }
          }
          return true;
        });
      }

      return result;
    }

    const id = `${++this.requestId}`;
    const { filter, onProgress } = options;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      const request: WorkerRequest = {
        type: 'parseGeoJSON',
        data: jsonString,
        filter,
        id,
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.clear();
      console.log('Data parser worker terminated');
    }
  }
}

// Singleton instance
export const dataParserWorker = new DataParserWorker();

// Auto cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dataParserWorker.terminate();
  });
}

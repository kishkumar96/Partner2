/**
 * Web Worker for parsing large JSON/GeoJSON files
 * Prevents main thread blocking when parsing 35MB+ files
 */

interface WorkerMessage {
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

// Worker code
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, data, filter, id } = event.data;

  try {
    switch (type) {
      case 'parse':
        handleParse(data, id);
        break;
      
      case 'parseGeoJSON':
        handleParseGeoJSON(data, id, filter);
        break;
      
      case 'filter':
        handleFilter(data, id, filter);
        break;
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      id,
    };
    self.postMessage(response);
  }
};

/**
 * Parse JSON string
 */
function handleParse(jsonString: string, id: string): void {
  const startTime = performance.now();
  
  // Report progress
  sendProgress(id, 0);
  
  const result = JSON.parse(jsonString);
  const parseTime = performance.now() - startTime;
  
  console.log(`Worker: Parsed JSON in ${parseTime.toFixed(0)}ms`);
  
  sendProgress(id, 100);
  sendSuccess(id, result);
}

/**
 * Parse GeoJSON with feature filtering
 */
function handleParseGeoJSON(jsonString: string, id: string, filter?: any): void {
  const startTime = performance.now();
  
  sendProgress(id, 10);
  
  const geojson = JSON.parse(jsonString);
  
  sendProgress(id, 50);
  
  // Apply filter if provided
  if (filter && geojson.features) {
    const originalCount = geojson.features.length;
    
    // Filter features based on properties
    geojson.features = geojson.features.filter((feature: any) => {
      return matchesFilter(feature.properties, filter);
    });
    
    console.log(`Worker: Filtered ${originalCount} -> ${geojson.features.length} features`);
  }
  
  const parseTime = performance.now() - startTime;
  console.log(`Worker: Parsed GeoJSON in ${parseTime.toFixed(0)}ms`);
  
  sendProgress(id, 100);
  sendSuccess(id, geojson);
}

/**
 * Filter already-parsed data
 */
function handleFilter(data: any, id: string, filter: any): void {
  const startTime = performance.now();
  
  sendProgress(id, 0);
  
  let result = data;
  
  if (data.features && Array.isArray(data.features)) {
    // GeoJSON filtering
    const originalCount = data.features.length;
    result = {
      ...data,
      features: data.features.filter((feature: any) => {
        return matchesFilter(feature.properties, filter);
      }),
    };
    
    console.log(`Worker: Filtered ${originalCount} -> ${result.features.length} features`);
  } else if (Array.isArray(data)) {
    // Array filtering
    const originalCount = data.length;
    result = data.filter((item: any) => matchesFilter(item, filter));
    
    console.log(`Worker: Filtered ${originalCount} -> ${result.length} items`);
  }
  
  const filterTime = performance.now() - startTime;
  console.log(`Worker: Filtered in ${filterTime.toFixed(0)}ms`);
  
  sendProgress(id, 100);
  sendSuccess(id, result);
}

/**
 * Check if an object matches filter criteria
 */
function matchesFilter(obj: any, filter: any): boolean {
  if (!filter || typeof filter !== 'object') {
    return true;
  }
  
  for (const key in filter) {
    const filterValue = filter[key];
    const objValue = obj[key];
    
    // Handle array filters (OR logic)
    if (Array.isArray(filterValue)) {
      if (!filterValue.includes(objValue)) {
        return false;
      }
    }
    // Handle range filters
    else if (typeof filterValue === 'object' && filterValue !== null) {
      if ('min' in filterValue && objValue < filterValue.min) {
        return false;
      }
      if ('max' in filterValue && objValue > filterValue.max) {
        return false;
      }
    }
    // Handle direct value match
    else if (objValue !== filterValue) {
      return false;
    }
  }
  
  return true;
}

/**
 * Send progress update
 */
function sendProgress(id: string, progress: number): void {
  const response: WorkerResponse = {
    type: 'progress',
    progress,
    id,
  };
  self.postMessage(response);
}

/**
 * Send success response
 */
function sendSuccess(id: string, data: any): void {
  const response: WorkerResponse = {
    type: 'success',
    data,
    id,
  };
  self.postMessage(response);
}

export {}; // Make this a module

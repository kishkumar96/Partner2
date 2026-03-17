# Partner API Service

This service (`partnerApiService.ts`) is responsible for all interactions with the external Partner API.

## Overview

- **`buildPartnerApiEndpoints`**: Constructs the necessary API URLs. It is designed to use a local proxy (`/api/partner-proxy`) to bypass CORS issues when running in a development environment.
- **`mapCountryPartnerApis`**: Fetches the list of countries from the Partner API and maps your application's country code (e.g., 'CK') to the specific ID used by the API.
- **`loadPartnerApiCountryData` (in `realDataLoader.ts`)**: This is the primary function that uses this service. It attempts to fetch all necessary data from the Partner API.

## Fallback Mechanism

The data loading functions are designed to be resilient. If any call to the Partner API fails (e.g., due to a timeout or the API being offline), the service will log a warning to the console and return `null` or empty data.

The main data loader (`loadAllRealData`) will then proceed to load the equivalent data from local files stored in the `/public/data/` directory. This ensures the application can always function, even if the external API is unavailable.

## Debugging

If you are seeing errors related to the Partner API, follow these steps:

1.  **Check the Console Logs**: Look for errors like `Failed to fetch partner countries`, `ConnectTimeoutError`, or `502 Bad Gateway` from `/api/partner-proxy`. This indicates a problem with the external API, not necessarily your application code.

2.  **Run the Health Check Script**: A dedicated script is available to test the live API endpoints directly. Run it from your terminal:

    ```bash
    node scripts/check-partner-api.js
    ```

    If this script reports that the API is unreachable or failing, the issue is with the external service.

3.  **Verify Local Fallback**: If the health check fails, confirm that the application is still loading data. It should be using the local files as a fallback. The application should appear to work, but the data will be from the static files in your project, not live from the API.

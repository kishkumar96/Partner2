# Climate Risk Dashboard

A modern WebGIS dashboard for climate risk assessment built with Next.js, Tailwind CSS, Mapbox, and Chart.js.

![Climate Risk Dashboard](https://github.com/user-attachments/assets/a20538a4-b75e-479e-aa7a-7dbe3290c6d0)

## Features

- **Interactive Map**: Mapbox GL map with hazard layers, event markers, and popups
- **Filter Panel**: Filter by hazard types, sectors, events, and date range
- **Summary Dashboard**: View key metrics with beautiful gradient cards
- **Charts**: Doughnut, bar, and line charts powered by Chart.js
- **Data Tables**: Event history, exposure analysis, and economic damage tables
- **Export**: Download reports as PDF or Excel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment Variables

Create a `.env.local` file with your Mapbox token:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS 4
- **Map**: Mapbox GL JS
- **Charts**: Chart.js with react-chartjs-2
- **PDF Export**: jsPDF
- **Excel Export**: ExcelJS

## Project Structure

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── BottomTabs.tsx
│   ├── ExportButtons.tsx
│   ├── FilterPanel.tsx
│   ├── MapView.tsx
│   └── SummaryPanel.tsx
├── data/
│   └── mockData.ts
├── types/
│   └── index.ts
└── utils/
    └── formatters.ts
```

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Tailwind CSS](https://tailwindcss.com/docs) - utility-first CSS framework.
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) - interactive maps.
- [Chart.js](https://www.chartjs.org/docs/) - flexible charting library.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

## License

MIT

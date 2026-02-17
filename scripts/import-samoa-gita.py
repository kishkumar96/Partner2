#!/usr/bin/env python3
"""
Import Samoa TC Gita data into PostgreSQL database
"""
import psycopg2
import json
import csv
from datetime import datetime
import sys

DATABASE_URL = "postgresql://kishank:Dcrp2024%40@localhost:5435/climate_risk"

def main():
    try:
        # Connect to database
        print("✓ Connecting to database...")
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        print("✓  Connected successfully")
        
        # Clear existing Gita data
        print("\n🧹 Clearing existing Samoa TC Gita data...")
        cur.execute("""
            DELETE FROM cyclone_track 
            WHERE cyclone_id = 'TC_GITA_2018' OR cyclone_name = 'Gita'
        """)
        conn.commit()
        print("✓ Cleared existing data")
        
        # Import forecast track from CSV
        print("\n📊 Importing TC Gita forecast track...")
        csv_path = '/home/kishank/Partner2/public/samoa/Official_Forecast_Track_GITA_SA.csv'
        
        imported = 0
        errors = 0
        
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    timestamp_str = row["Time[fmt=yyyy-MM-dd'T'HH:mm:ss'Z']"]
                    lat = float(row['Latitude'])
                    lon = float(row['Longitude'])
                    
                    # Normalize longitude to -180 to 180
                    if lon > 180:
                        lon = lon - 360
                    
                    pressure = float(row['Pressure']) if row['Pressure'] and row['Pressure'] != 'NaN' else None
                    wind_speed = float(row['MeanWind']) if row['MeanWind'] and row['MeanWind'] != 'NaN' else None
                    category = row.get('Category', '-3')
                    
                    # Parse timestamp
                    timestamp = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                    
                    # Determine if forecast (after 2018-02-10 12:00)
                    forecast_cutoff = datetime(2018, 2, 10, 12, 0, 0)
                    is_forecast = timestamp > forecast_cutoff
                    
                    # Insert into database
                    cur.execute("""
                        INSERT INTO cyclone_track (
                            cyclone_id, cyclone_name, geom, timestamp,
                            wind_speed, pressure, category, forecast
                        )
                        VALUES (
                            %s, %s, 
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                            %s, %s, %s, %s, %s
                        )
                    """, (
                        'TC_GITA_2018', 'Gita',
                        lon, lat,
                        timestamp, wind_speed, pressure, category, is_forecast
                    ))
                    
                    imported += 1
                    if imported % 10 == 0:
                        print(f"  Progress: {imported} points imported...", end='\r')
                        
                except Exception as e:
                    errors += 1
                    if errors < 5:
                        print(f"\n  ✗ Error at row: {e}")
        
        conn.commit()
        print(f"\n✓ Imported {imported} track points")
        if errors > 0:
            print(f"  ⚠ {errors} errors encountered")
        
        # Verify import
        print("\n✔️  Verifying import...")
        cur.execute("""
            SELECT 
                COUNT(*) as total_points,
                COUNT(*) FILTER (WHERE forecast = false) as historical_points,
                COUNT(*) FILTER (WHERE forecast = true) as forecast_points,
                MIN(timestamp) as first_point,
                MAX(timestamp) as last_point,
                MIN(pressure) as min_pressure,
                MAX(wind_speed) as max_wind_speed
            FROM cyclone_track
            WHERE cyclone_id = 'TC_GITA_2018'
        """)
        
        result = cur.fetchone()
        print(f"  Total points: {result[0]}")
        print(f"  Historical points: {result[1]}")
        print(f"  Forecast points: {result[2]}")
        print(f"  Time range: {result[3]} to {result[4]}")
        print(f"  Min pressure: {result[5]} hPa")
        print(f"  Max wind speed: {result[6]} knots")
        
        print("\n✅ Samoa TC Gita data import complete!")
        print("\n📍 You can now query the data with:")
        print("   curl http://localhost:3002/api/cyclone?cyclone_id=TC_GITA_2018")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()

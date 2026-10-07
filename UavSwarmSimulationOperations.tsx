import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Source/Widgets/widgets.css';

(window as any).CESIUM_BASE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/cesium/1.115.0/Build/Cesium/';

type Phase = 'PREFLIGHT' | 'INGRESS' | 'ONSTATION' | 'EGRESS' | 'POSTFLIGHT';

interface SwarmTelemetry {
  id: string;
  status: string;
  battery: number;
  altitude: number;
  speed: number;
}

export const UavSimulation: React.FC = () => {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const swarmEntitiesRef = useRef<Cesium.Entity[]>([]);
  const shipEntityRef = useRef<Cesium.Entity | null>(null);
  
  const [currentPhase, setCurrentPhase] = useState<Phase>('PREFLIGHT');
  const [telemetry, setTelemetry] = useState<SwarmTelemetry[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);

  const originLon = 114.0;
  const originLat = 15.0;
  const shipHeight = 0;

  const droneModelUrl = 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.gltf';

  const logEvent = (message: string) => {
    setSystemLogs((prev) => [`[\${new Date().toLocaleTimeString()}] \${message}`, ...prev.slice(0, 15)]);
  };

  useEffect(() => {
    if (!cesiumContainerRef.current) return;

    const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
      terrainProvider: undefined,
      animation: true,
      timeline: true,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: true,
      navigationHelpButton: false,
    });

    viewerRef.current = viewer;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(originLon, originLat - 0.02, 800),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0,
      },
    });

    const shipEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(originLon, originLat, shipHeight),
      box: {
        dimensions: new Cesium.Cartesian3(40, 150, 25),
        material: Cesium.Color.SLATEGRAY,
        outline: true,
        outlineColor: Cesium.Color.BLACK,
      },
      label: {
        text: 'CVN-Tactical Flagship',
        font: '14px monospace',
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
      },
    });
    shipEntityRef.current = shipEntity;

    const drones: Cesium.Entity[] = [];
    const initialTelemetry: SwarmTelemetry[] = [];

    for (let i = 0; i < 5; i++) {
      const offsetLon = originLon + (i - 2) * 0.0001;
      const id = `UAV-\${100 + i}`;
      const initialPos = Cesium.Cartesian3.fromDegrees(offsetLon, originLat, shipHeight + 15);
      
      const drone = viewer.entities.add({
        id: id,
        position: initialPos,
        orientation: new Cesium.VelocityOrientationProperty(
          new Cesium.CallbackProperty(() => drone.position?.getValue(viewer.clock.currentTime), false) as any
        ),
        model: {
          uri: droneModelUrl,
          minimumPixelSize: 64,
          maximumScale: 200,
          scale: 15.0,
          runAnimations: true
        },
        label: {
          text: id,
          font: '12px monospace',
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -30),
        },
      });

      drones.push(drone);
      initialTelemetry.push({
        id,
        status: 'STANDBY',
        battery: 100,
        altitude: 0,
        speed: 0,
      });
    }

    swarmEntitiesRef.current = drones;
    setTelemetry(initialTelemetry);
    logEvent('3D glTF Assets loaded. System initialization complete.');

    return () => {
      viewer.destroy();
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const drones = swarmEntitiesRef.current;
    const now = Cesium.JulianDate.now();

    switch (currentPhase) {
      case 'PREFLIGHT':
        logEvent('Executing Preflight diagnostics: Avionics spin-up.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'DIAGNOSTICS', speed: 0, altitude: 0 })));
        break;

      case 'INGRESS':
        logEvent('Launch authorized. Swarm ascending to formation waypoint.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'CLIMBING', speed: 120 })));
        
        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          
          const time0 = Cesium.JulianDate.addSeconds(now, 0, new Cesium.JulianDate());
          const pos0 = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.0001, originLat, shipHeight + 15);
          property.addSample(time0, pos0);

          const time1 = Cesium.JulianDate.addSeconds(now, 6, new Cesium.JulianDate());
          const pos1 = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.005, originLat + 0.01, 300);
          property.addSample(time1, pos1);

          const time2 = Cesium.JulianDate.addSeconds(now, 18, new Cesium.JulianDate());
          const targetLon = originLon - 0.02 + (index * 0.01);
          const targetLat = originLat + 0.05;
          const pos2 = Cesium.Cartesian3.fromDegrees(targetLon, targetLat, 600);
          property.addSample(time2, pos2);

          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.03, 1500),
          duration: 4,
        });
        break;

      case 'ONSTATION':
        logEvent('Onstation achieved. Initiating dynamic tactical loops.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'COMBAT_PATROL', speed: 180, altitude: 600 })));

        if (!viewer.entities.getById('AO_ZONE')) {
          viewer.entities.add({
            id: 'AO_ZONE',
            position: Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.08, 0),
            ellipse: {
              semiMinorAxis: 4000.0,
              semiMajorAxis: 4000.0,
              material: Cesium.Color.RED.withAlpha(0.12),
              outline: true,
              outlineColor: Cesium.Color.RED,
            }
          });
        }

        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          const radius = 0.025;
          
          for (let step = 0; step <= 360; step += 30) {
            const timeOffset = (step / 30) * 2.5;
            const time = Cesium.JulianDate.addSeconds(now, timeOffset, new Cesium.JulianDate());
            const radians = Cesium.Math.toRadians(step + (index * 72));
            const lon = originLon + radius * Math.cos(radians);
            const lat = (originLat + 0.08) + radius * Math.sin(radians);
            const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 600);
            property.addSample(time, pos);
          }
          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });
        break;

      case 'EGRESS':
        logEvent('Routing egress corridors back to task force.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'RETURNING', speed: 140, battery: 28 })));
        viewer.entities.removeById('AO_ZONE');

        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          
          const time0 = Cesium.JulianDate.addSeconds(now, 0, new Cesium.JulianDate());
          const currentPos = drone.position?.getValue(now) || Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.08, 600);
          property.addSample(time0, currentPos);

          const time1 = Cesium.JulianDate.addSeconds(now, 12, new Cesium.JulianDate());
          const returnPos = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.0001, originLat, shipHeight + 15);
          property.addSample(time1, returnPos);

          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });
        break;

      case 'POSTFLIGHT':
        logEvent('All units safely recovered on deck.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'DEBRIEFING', speed: 0, altitude: 0, battery: 18 })));
        
        drones.forEach((drone, index) => {
          const restingPos = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.0001, originLat, shipHeight + 15);
          drone.position = new Cesium.ConstantPositionProperty(restingPos);
          const heading = Cesium.Math.toRadians(0);
          const pitch = 0;
          const roll = 0;
          const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
          drone.orientation = new Cesium.ConstantProperty(Cesium.Transforms.headingPitchRollQuaternion(restingPos, hpr)) as any;
        });
        break;
    }
  }, [currentPhase]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentPhase === 'INGRESS' || currentPhase === 'ONSTATION') {
        setTelemetry((prev) =>
          prev.map((t) => ({
            ...t,
            battery: Math.max(t.battery - 1, 8),
            altitude: currentPhase === 'INGRESS' ? Math.min(t.altitude + 50, 600) : 600,
          }))
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentPhase]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'monospace', backgroundColor: '#0c1017', color: '#c9d1d9' }}>
      <div style={{ width: '400px', padding: '20px', display: 'flex', flexDirection: 'column', borderRight: '2px solid #21262d', boxSizing: 'border-box', overflowY: 'auto' }}>
        <h2 style={{ color: '#58a6ff', margin: '0 0 10px 0', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>⚡ 3D SWARM MESH</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {(['PREFLIGHT', 'INGRESS', 'ONSTATION', 'EGRESS', 'POSTFLIGHT'] as Phase[]).map((phase) => (
            <button
              key={phase}
              onClick={() => setCurrentPhase(phase)}
              style={{
                padding: '12px',
                textAlign: 'left',
                backgroundColor: currentPhase === phase ? '#1f6feb' : '#21262d',
                color: '#fff',
                border: '1px solid #30363d',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                letterSpacing: '1px',
                transition: 'background 0.2s'
              }}
            >
              {currentPhase === phase ? '▶ ' : '  '}{phase}
            </button>
          ))}
        </div>

        <h3 style={{ color: '#7ee787', margin: '10px 0' }}>🛰 LIVE TELEMETRY</h3>
        <div style={{ backgroundColor: '#161b22', padding: '10px', borderRadius: '6px', border: '1px solid #30363d' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e' }}>
                <th style={{ textAlign: 'left', padding: '4px' }}>UNIT</th>
                <th style={{ textAlign: 'left', padding: '4px' }}>STATUS</th>
                <th style={{ textAlign: 'right', padding: '4px' }}>ALT</th>
                <th style={{ textAlign: 'right', padding: '4px' }}>BAT</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.map((drone) => (
                <tr key={drone.id} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{drone.id}</td>
                  <td style={{ color: '#58a6ff' }}>{drone.status}</td>
                  <td style={{ textAlign: 'right' }}>{drone.altitude}m</td>
                  <td style={{ textAlign: 'right', color: drone.battery < 35 ? '#f85149' : '#7ee787' }}>{drone.battery}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ color: '#e3b341', margin: '20px 0 10px 0' }}>📜 MISSION LOGS</h3>
        <div style={{ flexGrow: 1, backgroundColor: '#010409', padding: '10px', borderRadius: '6px', fontSize: '11px', overflowY: 'auto', border: '1px solid #30363d', display: 'flex', flexDirection: 'column-reverse' }}>
          {systemLogs.map((log, index) => (
            <div key={index} style={{ marginBottom: '4px', color: log.includes('authorized') ? '#7ee787' : '#c9d1d9' }}>{log}</div>
          ))}
        </div>
      </div>
      <div ref={cesiumContainerRef} style={{ flexGrow: 1, height: '100%' }} />
    </div>
  );
};

export default UavSimulation;

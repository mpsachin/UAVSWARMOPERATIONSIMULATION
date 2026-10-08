import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

(window as any).CESIUM_BASE_URL = '/cesium/';

type Phase = 'PREFLIGHT' | 'INGRESS' | 'ONSTATION' | 'EGRESS' | 'POSTFLIGHT';

const phaseDetails: Record<Phase, { title: string; objective: string; location: string }> = {
  PREFLIGHT: {
    title: 'Preflight diagnostics',
    objective: 'Avionics spin-up and launch readiness checks',
    location: 'INS Mumbai (D62)',
  },
  INGRESS: {
    title: 'Ingress',
    objective: 'Swarm climbing and transiting to the formation waypoint',
    location: 'North of task force',
  },
  ONSTATION: {
    title: 'On station',
    objective: 'Swarm conducting coordinated patrol inside the area of operations',
    location: 'Patrol area',
  },
  EGRESS: {
    title: 'Egress',
    objective: 'Units following return corridors to the task force',
    location: 'Return to INS Mumbai',
  },
  POSTFLIGHT: {
    title: 'Postflight recovery',
    objective: 'All units recovered; mission debrief in progress',
    location: 'INS Mumbai (D62)',
  },
};

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
  const swarmCenterRef = useRef<Cesium.Entity | null>(null);
  const missionEntitiesRef = useRef<Cesium.Entity[]>([]);
  
  const [currentPhase, setCurrentPhase] = useState<Phase>('PREFLIGHT');
  const [telemetry, setTelemetry] = useState<SwarmTelemetry[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);

  const originLon = 114.0;
  const originLat = 15.0;
  const shipHeight = 0;

  const droneModelUrl = '/models/shahed-136.glb';
  const shipModelUrl = '/models/ins-mumbai.glb';

  const logEvent = (message: string) => {
    setSystemLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.slice(0, 15)]);
  };

  function focusOnPhase(phase: Phase) {
    const viewer = viewerRef.current;
    const target = phase === 'PREFLIGHT' || phase === 'POSTFLIGHT'
      ? shipEntityRef.current
      : swarmCenterRef.current;
    if (!viewer || !target) return;

    const cameraOffset = phase === 'PREFLIGHT' || phase === 'POSTFLIGHT'
      ? new Cesium.Cartesian3(0, -700, 500)
      : phase === 'ONSTATION'
        ? new Cesium.Cartesian3(0, -10500, 7200)
        : new Cesium.Cartesian3(0, -8500, 6000);
    target.viewFrom = cameraOffset;

    if (viewer.trackedEntity === target) {
      viewer.trackedEntity = undefined;
    }
    viewer.trackedEntity = target;
  }

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
      destination: Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.04, 26000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-55),
        roll: 0,
      },
    });
    viewer.clock.shouldAnimate = true;

    const shipEntity = viewer.entities.add({
      id: 'INS_MUMBAI',
      position: Cesium.Cartesian3.fromDegrees(originLon, originLat, shipHeight),
      model: {
        uri: shipModelUrl,
        minimumPixelSize: 110,
        maximumScale: 10,
        scale: 10,
        runAnimations: false,
      },
      label: {
        text: 'INS MUMBAI (D62)',
        font: '14px monospace',
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -42),
      },
    });
    shipEntityRef.current = shipEntity;

    const drones: Cesium.Entity[] = [];
    const initialTelemetry: SwarmTelemetry[] = [];

    for (let i = 0; i < 5; i++) {
      const offsetLon = originLon + (i - 2) * 0.00045;
      const id = `UAV-${100 + i}`;
      const initialPos = Cesium.Cartesian3.fromDegrees(offsetLon, originLat, shipHeight + 15);
      
      const drone = viewer.entities.add({
        id: id,
        position: initialPos,
        orientation: new Cesium.VelocityOrientationProperty(
          new Cesium.CallbackProperty(() => drone.position?.getValue(viewer.clock.currentTime), false) as any
        ),
        model: {
          uri: droneModelUrl,
          minimumPixelSize: 48,
          maximumScale: 15,
          scale: 5.0,
          runAnimations: false
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
    swarmCenterRef.current = viewer.entities.add({
      id: 'UAV_SWARM_CENTER',
      position: new Cesium.CallbackPositionProperty((time, result) => {
        const center = new Cesium.Cartesian3();
        let count = 0;
        drones.forEach((drone) => {
          const position = drone.position?.getValue(time);
          if (position) {
            Cesium.Cartesian3.add(center, position, center);
            count += 1;
          }
        });
        return count
          ? Cesium.Cartesian3.divideByScalar(center, count, result ?? new Cesium.Cartesian3())
          : Cesium.Cartesian3.fromDegrees(originLon, originLat, shipHeight, Cesium.Ellipsoid.WGS84, result);
      }, false, Cesium.ReferenceFrame.FIXED),
    });
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

    missionEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    missionEntitiesRef.current = [];
    viewer.entities.removeById('AO_ZONE');

    const addMissionRoute = (id: string, positions: Cesium.Cartesian3[], color: Cesium.Color) => {
      missionEntitiesRef.current.push(viewer.entities.add({
        id: `MISSION_ROUTE_${id}`,
        polyline: {
          positions,
          width: 3,
          material: color.withAlpha(0.85),
          clampToGround: false,
        },
      }));
    };

    const addMissionMarker = (id: string, text: string, longitude: number, latitude: number, color: Cesium.Color) => {
      missionEntitiesRef.current.push(viewer.entities.add({
        id: `MISSION_MARKER_${id}`,
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
        point: {
          pixelSize: 12,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text,
          font: 'bold 13px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(12, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }));
    };

    const routeColors = [
      Cesium.Color.CYAN,
      Cesium.Color.LIME,
      Cesium.Color.YELLOW,
      Cesium.Color.ORANGE,
      Cesium.Color.MAGENTA,
    ];

    switch (currentPhase) {
      case 'PREFLIGHT':
        logEvent('Executing Preflight diagnostics: Avionics spin-up.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'DIAGNOSTICS', speed: 0, altitude: 0 })));
        addMissionMarker('FLAGSHIP', 'PREFLIGHT / FLAGSHIP', originLon, originLat, Cesium.Color.CYAN);
        break;

      case 'INGRESS':
        logEvent('Launch authorized. Swarm ascending to formation waypoint.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'CLIMBING', speed: 120 })));
        
        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          
          const time0 = Cesium.JulianDate.addSeconds(now, 0, new Cesium.JulianDate());
          const pos0 = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.00045, originLat, shipHeight + 15);
          property.addSample(time0, pos0);

          const time1 = Cesium.JulianDate.addSeconds(now, 6, new Cesium.JulianDate());
          const pos1 = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.005, originLat + 0.01, 300);
          property.addSample(time1, pos1);

          const time2 = Cesium.JulianDate.addSeconds(now, 18, new Cesium.JulianDate());
          const targetLon = originLon - 0.02 + (index * 0.01);
          const targetLat = originLat + 0.05;
          const pos2 = Cesium.Cartesian3.fromDegrees(targetLon, targetLat, 600);
          property.addSample(time2, pos2);

          addMissionRoute(drone.id, [pos0, pos1, pos2], routeColors[index]);
          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });

        addMissionMarker('INGRESS', 'INGRESS FORMATION', originLon, originLat + 0.05, Cesium.Color.CYAN);
        break;

      case 'ONSTATION':
        logEvent('Onstation achieved. Initiating dynamic tactical loops.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'COMBAT_PATROL', speed: 180, altitude: 600 })));

        viewer.entities.add({
          id: 'AO_ZONE',
          position: Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.08, 0),
          ellipse: {
            semiMinorAxis: 4000.0,
            semiMajorAxis: 4000.0,
            material: Cesium.Color.RED.withAlpha(0.12),
            outline: true,
            outlineColor: Cesium.Color.RED,
          },
        });
        addMissionMarker('PATROL', 'ACTIVE PATROL AREA', originLon, originLat + 0.08, Cesium.Color.RED);

        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          const radius = 0.025;
          const patrolPositions: Cesium.Cartesian3[] = [];
          
          for (let step = 0; step <= 360; step += 30) {
            const timeOffset = (step / 30) * 2.5;
            const time = Cesium.JulianDate.addSeconds(now, timeOffset, new Cesium.JulianDate());
            const radians = Cesium.Math.toRadians(step + (index * 72));
            const lon = originLon + radius * Math.cos(radians);
            const lat = (originLat + 0.08) + radius * Math.sin(radians);
            const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 600);
            property.addSample(time, pos);
            patrolPositions.push(pos);
          }
          if (index === 0) addMissionRoute('PATROL', patrolPositions, Cesium.Color.RED);
          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });
        break;

      case 'EGRESS':
        logEvent('Routing egress corridors back to task force.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'RETURNING', speed: 140, battery: 28 })));

        drones.forEach((drone, index) => {
          const property = new Cesium.SampledPositionProperty();
          
          const time0 = Cesium.JulianDate.addSeconds(now, 0, new Cesium.JulianDate());
          const currentPos = drone.position?.getValue(now) || Cesium.Cartesian3.fromDegrees(originLon, originLat + 0.08, 600);
          property.addSample(time0, currentPos);

          const time1 = Cesium.JulianDate.addSeconds(now, 12, new Cesium.JulianDate());
          const returnPos = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.00045, originLat, shipHeight + 15);
          property.addSample(time1, returnPos);

          addMissionRoute(drone.id, [currentPos, returnPos], routeColors[index]);
          drone.position = property;
          drone.orientation = new Cesium.VelocityOrientationProperty(property) as any;
        });
        addMissionMarker('RECOVERY', 'RECOVERY / FLAGSHIP', originLon, originLat, Cesium.Color.LIME);
        break;

      case 'POSTFLIGHT':
        logEvent('All units safely recovered on deck.');
        setTelemetry(prev => prev.map(t => ({ ...t, status: 'DEBRIEFING', speed: 0, altitude: 0, battery: 18 })));
        viewer.entities.removeById('AO_ZONE');
        addMissionMarker('RECOVERY_COMPLETE', 'UNITS RECOVERED', originLon, originLat, Cesium.Color.LIME);
        
        drones.forEach((drone, index) => {
          const restingPos = Cesium.Cartesian3.fromDegrees(originLon + (index - 2) * 0.00045, originLat, shipHeight + 15);
          drone.position = new Cesium.ConstantPositionProperty(restingPos);
          const heading = Cesium.Math.toRadians(0);
          const pitch = 0;
          const roll = 0;
          const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
          drone.orientation = new Cesium.ConstantProperty(Cesium.Transforms.headingPitchRollQuaternion(restingPos, hpr)) as any;
        });
        break;
    }
    focusOnPhase(currentPhase);
  }, [currentPhase]);

  const activeOperation = phaseDetails[currentPhase];

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
              onClick={() => {
                if (currentPhase === phase) {
                  focusOnPhase(phase);
                } else {
                  setCurrentPhase(phase);
                }
              }}
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
      <div style={{ position: 'relative', flexGrow: 1, minWidth: 0, height: '100%' }}>
        <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />
        <section
          aria-label="Active operation on map"
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            width: 'min(360px, calc(100% - 32px))',
            padding: '16px',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            background: 'rgba(12, 16, 23, 0.92)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: '#8b949e', fontSize: '11px', letterSpacing: '1px' }}>ACTIVE OPERATION</div>
          <div style={{ marginTop: '6px', color: '#58a6ff', fontSize: '20px', fontWeight: 'bold' }}>
            {activeOperation.title.toUpperCase()}
          </div>
          <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5 }}>{activeOperation.objective}</div>
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #30363d', fontSize: '12px' }}>
            <span style={{ color: '#8b949e' }}>LOCATION </span>
            <span>{activeOperation.location}</span>
            <span style={{ float: 'right', color: '#7ee787' }}>
              {telemetry.filter((unit) => unit.status !== 'STANDBY').length}/{telemetry.length} UNITS ACTIVE
            </span>
          </div>
          <div style={{ marginTop: '10px', color: '#8b949e', fontSize: '11px' }}>
            ROUTES ARE COLOR-CODED BY UAV; RED MARKS THE PATROL AREA
          </div>
        </section>
      </div>
    </div>
  );
};

export default UavSimulation;

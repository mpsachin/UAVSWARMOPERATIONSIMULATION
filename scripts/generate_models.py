import json
import math
import os
import struct


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "models")

MATERIALS = {
    "aircraft": {"name": "UAV sand gray", "color": [0.67, 0.66, 0.57, 1]},
    "aircraft_dark": {"name": "UAV engine and propeller", "color": [0.13, 0.15, 0.14, 1]},
    "aircraft_glass": {"name": "UAV nose sensor", "color": [0.16, 0.20, 0.20, 1]},
    "ship_hull": {"name": "INS Mumbai hull", "color": [0.20, 0.27, 0.31, 1]},
    "ship_deck": {"name": "Non-skid deck", "color": [0.34, 0.39, 0.40, 1]},
    "ship_structure": {"name": "Ship superstructure", "color": [0.69, 0.71, 0.68, 1]},
    "ship_dark": {"name": "Ship fittings", "color": [0.20, 0.24, 0.25, 1]},
    "ship_glass": {"name": "Bridge glazing", "color": [0.12, 0.23, 0.27, 1]},
    "marking": {"name": "Safety markings", "color": [0.83, 0.76, 0.45, 1]},
    "red": {"name": "Waterline marking", "color": [0.56, 0.19, 0.16, 1]},
}


class Model:
    def __init__(self):
        self.triangles = {name: [] for name in MATERIALS}

    def triangle(self, material, a, b, c):
        self.triangles[material].append((a, b, c))

    def quad(self, material, a, b, c, d):
        self.triangle(material, a, b, c)
        self.triangle(material, a, c, d)

    def box(self, material, center, size):
        x, y, z = center
        sx, sy, sz = (dimension / 2 for dimension in size)
        vertices = [
            (x - sx, y - sy, z - sz), (x + sx, y - sy, z - sz),
            (x + sx, y + sy, z - sz), (x - sx, y + sy, z - sz),
            (x - sx, y - sy, z + sz), (x + sx, y - sy, z + sz),
            (x + sx, y + sy, z + sz), (x - sx, y + sy, z + sz),
        ]
        for face in (
            (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
            (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ):
            self.quad(material, *(vertices[i] for i in face))

    def cylinder(self, material, center, radius, height, segments=12, top_radius=None):
        x, y, z = center
        top_radius = radius if top_radius is None else top_radius
        lower = []
        upper = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            cosine, sine = math.cos(angle), math.sin(angle)
            lower.append((x + radius * cosine, y + radius * sine, z))
            upper.append((x + top_radius * cosine, y + top_radius * sine, z + height))
        for i in range(segments):
            j = (i + 1) % segments
            self.quad(material, lower[i], lower[j], upper[j], upper[i])
            self.triangle(material, (x, y, z), lower[j], lower[i])
            self.triangle(material, (x, y, z + height), upper[i], upper[j])

    def wing(self, material, outline, z, thickness):
        upper = [(x, y, z + thickness / 2) for x, y in outline]
        lower = [(x, y, z - thickness / 2) for x, y in outline]
        for i in range(1, len(outline) - 1):
            self.triangle(material, upper[0], upper[i], upper[i + 1])
            self.triangle(material, lower[0], lower[i + 1], lower[i])
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            self.quad(material, lower[i], lower[j], upper[j], upper[i])

    def panel(self, material, outline, thickness):
        front = [(x - thickness / 2, y, z) for x, y, z in outline]
        back = [(x + thickness / 2, y, z) for x, y, z in outline]
        for i in range(1, len(outline) - 1):
            self.triangle(material, front[0], front[i], front[i + 1])
            self.triangle(material, back[0], back[i + 1], back[i])
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            self.quad(material, front[i], front[j], back[j], back[i])

    def loft(self, material, stations, segments=12):
        rings = []
        for x, half_width, half_height, z_center in stations:
            ring = []
            for i in range(segments):
                angle = 2 * math.pi * i / segments
                ring.append((
                    x,
                    half_width * math.cos(angle),
                    z_center + half_height * math.sin(angle),
                ))
            rings.append(ring)
        for previous, following in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                self.quad(material, previous[i], following[i], following[j], previous[j])
        self.triangle(material, *reversed(rings[0][:3]))
        self.triangle(material, *rings[-1][:3])


def make_shahed():
    model = Model()
    model.loft("aircraft", [
        (7.4, 0.04, 0.05, 1.35),
        (6.4, 0.17, 0.17, 1.35),
        (4.5, 0.34, 0.31, 1.35),
        (1.5, 0.43, 0.37, 1.35),
        (-2.6, 0.42, 0.36, 1.35),
        (-4.8, 0.34, 0.30, 1.35),
        (-5.9, 0.25, 0.23, 1.35),
        (-6.6, 0.17, 0.17, 1.35),
    ], 16)
    model.wing("aircraft", [
        (5.3, 0), (-3.8, -5.5), (-5.4, -5.5),
        (-5.4, 5.5), (-3.8, 5.5),
    ], 1.31, 0.18)
    model.box("aircraft_dark", (-5.25, 0, 1.36), (1.55, 0.54, 0.48))
    model.panel("aircraft_dark", [
        (-6.25, -0.12, 1.35),
        (-6.25, 0.12, 1.35),
        (-6.25, 0.14, 2.38),
        (-6.25, -0.14, 2.38),
    ], 0.12)
    model.panel("aircraft_dark", [
        (-6.25, -1.0, 1.23),
        (-6.25, 1.0, 1.23),
        (-6.25, 0.14, 1.37),
        (-6.25, -0.14, 1.37),
    ], 0.12)
    model.box("aircraft_glass", (6.02, 0, 1.35), (0.28, 0.30, 0.22))
    return model


def make_ins_mumbai():
    model = Model()
    stations = [
        (-81.5, 2.0, 8.0, 5.0), (-75, 5.4, 8.0, 5.0),
        (-55, 8.2, 8.0, 5.0), (45, 8.2, 8.0, 5.0),
        (67, 7.0, 8.0, 5.0), (77, 5.4, 8.0, 5.0),
        (81.5, 2.3, 8.0, 5.0),
    ]
    model.loft("ship_hull", stations, 8)
    model.wing("ship_deck", [
        (-75, -5.2), (-60, -8.5), (51, -8.5), (76, -5.1),
        (80, 0), (76, 5.1), (51, 8.5), (-60, 8.5), (-75, 5.2),
    ], 9.15, 0.55)
    model.box("ship_deck", (-42, 0, 9.55), (44, 12.5, 0.28))
    model.box("ship_deck", (54, 0, 9.55), (36, 13.8, 0.28))
    model.box("marking", (54, 0, 9.72), (26, 0.25, 0.04))
    model.box("marking", (54, 0, 9.72), (0.25, 10, 0.04))

    model.box("ship_structure", (24, 0, 13.1), (26, 12.8, 7.4))
    model.box("ship_structure", (28, 0, 19.0), (18, 10.4, 5.2))
    model.box("ship_glass", (37.15, 0, 19.1), (0.18, 8.4, 1.5))
    model.box("ship_dark", (20, 0, 22.2), (3.0, 3.0, 1.8))
    model.box("ship_structure", (-3, 0, 12.2), (15, 9.2, 5.1))
    model.box("ship_structure", (-1, 0, 16.8), (9, 7.2, 4.2))
    model.box("ship_glass", (3.6, 0, 17.1), (0.18, 5.6, 1.1))

    model.box("ship_dark", (11, 0, 24.4), (2.3, 2.3, 8.0))
    model.box("ship_dark", (12, 0, 29.0), (4.2, 4.2, 0.45))
    model.cylinder("ship_dark", (11, 0, 30), 0.3, 7, 8)
    model.box("ship_dark", (11, 0, 36.5), (4.8, 0.16, 0.18))
    model.box("ship_dark", (11, 0, 34), (0.16, 4.3, 0.18))
    model.cylinder("ship_dark", (-2, 0, 18.7), 0.32, 9, 8)
    model.box("ship_dark", (-2, 0, 25.8), (3.5, 0.15, 0.15))
    model.box("ship_dark", (-2, 0, 23.5), (0.15, 3.5, 0.15))

    model.cylinder("ship_structure", (65, 0, 9.7), 2.3, 2.6, 12, 1.7)
    model.cylinder("ship_dark", (65, 0, 12.3), 0.72, 1.6, 12, 0.28)
    for y in (-5.0, 5.0):
        model.box("ship_dark", (15, y, 10.8), (8, 2.2, 2.5))
        model.box("ship_dark", (-34, y, 10.8), (8, 2.2, 2.5))
    for x in (-57, -48, -39):
        model.box("marking", (x, 0, 9.72), (0.18, 11, 0.04))

    # Port and starboard shaft fairings and propellers suggest the twin-screw hull.
    for y in (-3.0, 3.0):
        model.box("ship_hull", (-68, y, 3.3), (18, 0.65, 0.7))
        model.cylinder("ship_dark", (-75, y, 2.4), 1.15, 0.35, 10)
    return model


def write_glb(path, model):
    binary = bytearray()
    accessors = []
    views = []
    meshes = []
    nodes = []
    scene_nodes = []

    def append_data(data, target):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            view["target"] = target
        views.append(view)
        return len(views) - 1

    for material_index, (material_name, triangles) in enumerate(model.triangles.items()):
        if not triangles:
            continue
        positions = []
        normals = []
        indices = []
        for triangle in triangles:
            ax, ay, az = triangle[0]
            bx, by, bz = triangle[1]
            cx, cy, cz = triangle[2]
            ab = (bx - ax, by - ay, bz - az)
            ac = (cx - ax, cy - ay, cz - az)
            normal = (
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            )
            magnitude = math.sqrt(sum(component * component for component in normal)) or 1
            normal = tuple(component / magnitude for component in normal)
            for vertex in triangle:
                # Map model forward/right/up axes to glTF +Z-forward, +X-right, +Y-up.
                positions.extend((vertex[1], vertex[2], vertex[0]))
                normals.extend((normal[1], normal[2], normal[0]))
                indices.append(len(indices))

        position_bytes = struct.pack(f"<{len(positions)}f", *positions)
        normal_bytes = struct.pack(f"<{len(normals)}f", *normals)
        index_bytes = struct.pack(f"<{len(indices)}I", *indices)
        position_view = append_data(position_bytes, 34962)
        normal_view = append_data(normal_bytes, 34962)
        index_view = append_data(index_bytes, 34963)
        vertex_count = len(positions) // 3
        position_accessor = len(accessors)
        accessors.append({
            "bufferView": position_view, "componentType": 5126, "count": vertex_count,
            "type": "VEC3",
            "min": [min(positions[i::3]) for i in range(3)],
            "max": [max(positions[i::3]) for i in range(3)],
        })
        normal_accessor = len(accessors)
        accessors.append({
            "bufferView": normal_view, "componentType": 5126, "count": vertex_count, "type": "VEC3",
        })
        index_accessor = len(accessors)
        accessors.append({
            "bufferView": index_view, "componentType": 5125, "count": len(indices), "type": "SCALAR",
        })
        meshes.append({
            "name": MATERIALS[material_name]["name"],
            "primitives": [{
                "attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor},
                "indices": index_accessor,
                "material": material_index,
            }],
        })
        nodes.append({"name": MATERIALS[material_name]["name"], "mesh": len(meshes) - 1})
        scene_nodes.append(len(nodes) - 1)

    document = {
        "asset": {"version": "2.0", "generator": "UAV Swarm Operations procedural model generator"},
        "scene": 0,
        "scenes": [{"nodes": scene_nodes}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [{
            "name": item["name"],
            "pbrMetallicRoughness": {
                "baseColorFactor": item["color"],
                "metallicFactor": 0.18,
                "roughnessFactor": 0.72,
            },
            "doubleSided": True,
        } for item in MATERIALS.values()],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    json_bytes = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary.extend(b"\0" * ((4 - len(binary) % 4) % 4))
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    with open(path, "wb") as output:
        output.write(struct.pack("<4sII", b"glTF", 2, total_length))
        output.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        output.write(json_bytes)
        output.write(struct.pack("<I4s", len(binary), b"BIN\0"))
        output.write(binary)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    outputs = [
        ("shahed-136.glb", make_shahed()),
        ("ins-mumbai.glb", make_ins_mumbai()),
    ]
    for filename, model in outputs:
        path = os.path.join(OUTPUT_DIR, filename)
        write_glb(path, model)
        print(f"{path}: {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()

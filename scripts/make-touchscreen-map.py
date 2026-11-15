"""Create the touchscreen floor plan from the shared HIVE SVG."""

from pathlib import Path
import xml.etree.ElementTree as ET


def main():
    root_dir = Path(__file__).resolve().parent.parent
    namespace = "http://www.w3.org/2000/svg"
    ET.register_namespace("", namespace)
    tree = ET.parse(root_dir / "public" / "HIVE.svg")
    root = tree.getroot()
    tag_count = 0

    for parent in root.iter():
        children = list(parent)
        for index, child in enumerate(children):
            if child.tag != f"{{{namespace}}}path" or child.get("class") not in {"st27", "st28", "st29", "st30"}:
                continue

            # Each boxed tag has two leader lines, two dots, a box and its outline,
            # followed by the text group. Keep the room numbers and floor geometry.
            annotation = children[max(0, index - 2):index + 5]
            pattern = [node.tag.rsplit("}", 1)[-1] for node in annotation]
            if pattern != ["circle", "line", "path", "path", "line", "circle", "g"]:
                raise ValueError("The SVG tag structure changed; review it before removing annotations.")
            for node in annotation:
                parent.remove(node)
            tag_count += 1

    style = root.find(f"{{{namespace}}}defs/{{{namespace}}}style")
    # The touchscreen inverts this image, turning black lettering pure white.
    style.text += "\n      text, tspan { fill: #000 !important; stroke: none !important; }\n"
    tree.write(root_dir / "public" / "HIVE-touchscreen.svg", encoding="utf-8", xml_declaration=True)
    print(f"Created HIVE-touchscreen.svg without {tag_count} boxed tags.")


if __name__ == "__main__":
    main()

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Immutable onchain SVG art. Rarity is cosmetic and does not change rent.
contract CyberToshiRenderer {
    using Strings for uint256;

    function tierForRoll(uint256 roll) public pure returns (uint256) {
        require(roll < 100, "Invalid roll");
        return roll < 60 ? 0 : roll < 85 ? 1 : roll < 97 ? 2 : 3;
    }

    function rarity(bytes32 seed) public pure returns (uint256) {
        uint256 value = uint256(keccak256(abi.encode(seed, "rarity")));
        uint256 cutoff = type(uint256).max - (type(uint256).max % 100);
        while (value >= cutoff) value = uint256(keccak256(abi.encode(value)));
        return tierForRoll(value % 100);
    }

    function tierName(uint256 t) public pure returns (string memory) {
        return t == 0 ? "Common" : t == 1 ? "Rare" : t == 2 ? "Epic" : "Legendary";
    }

    function rect(uint256 x, uint256 y, uint256 w, uint256 h, string memory color)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<rect x="',
            x.toString(),
            '" y="',
            y.toString(),
            '" width="',
            w.toString(),
            '" height="',
            h.toString(),
            '" fill="',
            color,
            '"/>'
        );
    }

    function traits(bytes32 seed)
        public
        pure
        returns (uint256 t, uint256 bg, uint256 fur, uint256 clothing, uint256 visor, uint256 gear)
    {
        t = rarity(seed);
        if (t == 0) {
            bg = uint8(seed[1]) % 3;
            fur = uint8(seed[2]) % 3;
            clothing = uint8(seed[3]) % 3;
            if (clothing == 2) clothing = 5;
            visor = uint8(seed[4]) % 3;
            if (visor == 2) visor = 5;
            gear = uint8(seed[5]) % 2;
        } else if (t == 1) {
            bg = 3 + uint8(seed[1]) % 3;
            fur = 3 + uint8(seed[2]) % 3;
            clothing = 2 + uint8(seed[3]) % 2;
            visor = 2 + uint8(seed[4]) % 2;
            gear = 2 + uint8(seed[5]) % 2;
        } else if (t == 2) {
            bg = 6;
            fur = 6;
            clothing = 4;
            visor = 4;
            gear = 4 + uint8(seed[5]) % 2;
        } else {
            bg = 7;
            fur = 7;
            clothing = 4;
            visor = 4;
            gear = 6;
        }
    }

    function renderSVG(uint256 id, bytes32 seed) public pure returns (string memory svg) {
        (uint256 t, uint256 bg, uint256 fur, uint256 clothing, uint256 visor, uint256 gear) = traits(seed);
        string[8] memory colors = [
            "#64748b", "#cbd5e1", "#1e293b", "#0052ff", "#a855f7", "#f8fafc", "#22c55e", "#facc15"
        ];
        string[8] memory backgrounds =
            ["#07152e", "#111827", "#052e26", "#30164b", "#261246", "#14342a", "#002b9e", "#442b12"];
        string[6] memory clothes = ["#0052ff", "#eab308", "#475569", "#09090b", "#9333ea", "#78716c"];
        string[4] memory borders = ["#64748b", "#38bdf8", "#c084fc", "#facc15"];
        svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36" shape-rendering="crispEdges">',
            rect(0, 0, 32, 36, backgrounds[bg])
        );
        // Seed-derived constellation: 64 independently variable background cells.
        for (uint256 i; i < 64; i++) {
            if ((uint256(seed) >> (i + 64)) & 1 == 1) svg = string.concat(
                svg, rect((i % 8) * 4, (i / 8) * 4, 1, 1, "#456080")
            );
        }
        svg = string.concat(
            svg,
            '<path d="M25 30h3v-7h-2v-3h3v2h2v10h-8z" fill="', colors[fur], '"/>',
            '<path d="M9 23h14v2h3v7H6v-7h3z" fill="#030916"/>',
            rect(8, 25, 16, 7, clothes[clothing]),
            '<path d="M11 25l5 4 5-4M16 29v3" fill="none" stroke="#dbeafe" stroke-width="0.5"/>',
            // Short, triangular ears and a wide stepped cheek silhouette.
            '<path d="M5 7h2v1h2v1h2v1h10V9h2V8h2V7h2v14h-2v2h-3v2H10v-2H7v-2H5z" fill="#030916"/>',
            '<path d="M6 9h2v1h2v2h12v-2h2V9h2v11h-2v2h-3v2H11v-2H8v-2H6z" fill="', colors[fur], '"/>',
            '<path d="M7 10h1v1h1v3H7zm18 0h-1v1h-1v3h2z" fill="#f9a8b7"/>',
            '<path d="M13 12v2h1v-2m2 0v3h1v-3m2 0v2h1v-2" stroke="#030916" stroke-opacity=".3"/>',
            '<path d="M11 19h10v3h-2v1h-6v-1h-2z" fill="#f4e7dc"/>'
        );
        // Individual fur markings preserve variety inside every tier.
        for (uint256 i; i < 12; i++) {
            if ((uint256(seed) >> (i + 128)) & 1 == 1) {
                svg = string.concat(svg, rect(8 + i % 6 * 3, 13 + i / 6 * 5, 1, 1, t == 3 ? "#ca8a04" : "#475569"));
            }
        }
        if (visor == 4) {
            svg = string.concat(svg, rect(0, 16, 32, 1, "#fb7185"), rect(9, 15, 4, 3, "#fff1f2"), rect(19, 15, 4, 3, "#fff1f2"));
        } else if (visor == 3) {
            svg = string.concat(svg, rect(8, 14, 6, 5, "#fbbf24"), rect(9, 15, 4, 3, "#164e63"), rect(10, 15, 1, 1, "#a5f3fc"), rect(20, 15, 2, 3, "#0f172a"));
        } else if (visor == 5) {
            svg = string.concat(svg, rect(9, 15, 4, 3, "#bef264"), rect(19, 15, 4, 3, "#bef264"), rect(11, 15, 1, 3, "#030916"), rect(20, 15, 1, 3, "#030916"));
        } else {
            svg = string.concat(
                svg,
                rect(8, 14, 16, 4, visor == 0 ? "#ffffff" : visor == 1 ? "#0f172a" : "#22d3ee"),
                rect(14, 15, 4, 3, colors[fur]),
                rect(9, 15, 2, 1, "#7dd3fc"), rect(19, 15, 2, 1, "#7dd3fc")
            );
        }
        svg = string.concat(
            svg, '<path d="M15 19h2v1h-2zM16 20v1h-2m2 0h2" fill="#c46b85" stroke="#663344" stroke-width=".5"/>',
            '<path d="M3 18l7 2M2 21h8m12-1 7-2m-7 3h8" stroke="#e2e8f0" stroke-width=".5"/>'
        );
        if (gear == 1) svg = string.concat(svg, '<path d="M24 25h5v5h-5zm5 1h2v3h-2" fill="#fff"/>', rect(25, 26, 3, 2, "#0052ff"), rect(25, 22, 1, 2, "#cbd5e1"));
        if (gear == 2) svg = string.concat(svg, '<path d="M8 26v4h19v-5" fill="none" stroke="#22d3ee"/>', rect(26, 24, 3, 2, "#facc15"));
        if (gear == 3) svg = string.concat(svg, '<path d="M21 27h6v-1h2v5h-2v-1h-6v-1h-1v-1h1z" fill="#fb923c"/>', rect(22, 28, 1, 1, "#030916"));
        if (gear == 4) svg = string.concat(svg, '<path d="M10 25v2h2v1h8v-1h2v-2" fill="none" stroke="#facc15"/>', rect(15, 28, 2, 2, "#facc15"));
        if (gear == 5) svg = string.concat(svg, rect(12, 5, 8, 5, "#9333ea"), rect(10, 10, 12, 1, "#c084fc"), rect(12, 8, 8, 1, "#facc15"));
        if (gear == 6) svg = string.concat(svg, '<path d="M10 4h12v1H10zm-2 1h2v1H8zm14 0h2v1h-2zM10 6h12v1H10z" fill="#93c5fd"/>');
        svg = string.concat(svg, rect(0, 32, 32, 4, borders[t]));
        // Visible 15-bit serial makes every issued cat distinct, even for identical seeds.
        for (uint256 i; i < 15; i++) {
            if ((id >> i) & 1 == 1) svg = string.concat(svg, rect(1 + i * 2, 33, 1, 2, "#020617"));
        }
        return string.concat(svg, "</svg>");
    }

    function renderTokenURI(uint256 id, bytes32 seed) external pure returns (string memory) {
        (uint256 t, uint256 bg, uint256 fur, uint256 clothing, uint256 visor, uint256 gear) = traits(seed);
        string[8] memory furNames = [
            "Toshi Classic",
            "Cyber Silver",
            "Shadow Tux",
            "Base Blue",
            "Neon Violet",
            "Albino White",
            "Glitch Green",
            "Golden Fur"
        ];
        string[6] memory clothingNames =
            ["Base Hoodie", "Onchain Summer Tee", "Cyber Armor", "Matrix Coat", "Degen Robe", "Earth Hoodie"];
        string[6] memory visorNames =
            ["Clout Goggles", "8-Bit Shades", "Cyber VR", "Cyborg Monocle", "Laser Eyes", "Natural Eyes"];
        string[7] memory gearNames =
            ["Clean Whiskers", "Onchain Coffee", "Fiber Cable", "Pixel Fish", "Gold Chain", "Degen Hat", "Ether Halo"];
        string memory json = string.concat(
            '{"name":"CyberToshi #',
            id.toString(),
            '","description":"An independent onchain community experiment on Base. Cosmetic traits can be selected through additional proof-of-work. No affiliation with Base, Coinbase or Toshi.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(renderSVG(id, seed))),
            '","attributes":[',
            attribute("Rarity Tier", tierName(t)),
            ",",
            attribute("Background", bg.toString()),
            ",",
            attribute("Fur", furNames[fur]),
            ",",
            attribute("Clothing", clothingNames[clothing]),
            ",",
            attribute("Visor", visorNames[visor]),
            ",",
            attribute("Gear", gearNames[gear]),
            ",",
            attribute("Serial", id.toString()),
            "]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function attribute(string memory key, string memory value) internal pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":"', value, '"}');
    }
}

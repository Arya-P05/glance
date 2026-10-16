import { layoutCaptionGlyphs, moveCaptionLine } from "../lib/captionFont";
import React, { useRef, useState } from "react";
import { View, PanResponder } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { CaptionLayout, CaptionText, captionLines } from "../lib/captionLayout";

type Props = {
  width: number; height: number; layout: CaptionLayout; caption: CaptionText;
  onChange?: (layout: CaptionLayout) => void;
  opacity?: number;
};

export function CaptionLines({ width, height, layout, caption, onChange, opacity = 1 }: Props) {
  return <View pointerEvents={onChange ? "box-none" : "none"} style={{ position: "absolute", left: 0, top: 0, width, height, opacity }}>
    {captionLines(width, height, layout, caption).map(line =>
      <CaptionLine key={line.line} {...{ width, height, layout, onChange, line }} />
    )}
  </View>;
}

function CaptionLine({ width, height, layout, onChange, line }: {
  width: number; height: number; layout: CaptionLayout; onChange?: Props["onChange"];
  line: ReturnType<typeof captionLines>[number];
}) {
  const [dragging, setDragging] = useState(false);
  const current = useRef({ layout, onChange, line, width, height });
  current.current = { layout, onChange, line, width, height };
  const start = useRef(layout);
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => Boolean(current.current.onChange),
    onMoveShouldSetPanResponder: () => Boolean(current.current.onChange),
    onPanResponderGrant: () => { start.current = current.current.layout; },
    onPanResponderMove: (_, gesture) => {
      setDragging(true);
      const c = current.current;
      c.onChange?.(moveCaptionLine(c.width, c.height, start.current, c.line.line, gesture.dx, gesture.dy));
    },
    onPanResponderRelease: () => setDragging(false),
    onPanResponderTerminate: () => setDragging(false),
  })).current;
  // A separate SVG viewport for each line keeps the preview's baseline and font identical to export.
  const outlines = layoutCaptionGlyphs(line.text, line.size, layout.letterSpacingEm);
  const boxWidth = Math.max(32, outlines.width + 20);
  return <View {...(onChange ? responder.panHandlers : {})}
    accessibilityLabel={`${line.line === "small" ? "First" : "Second"} caption line`}
    style={{ position: "absolute", left: line.x - boxWidth / 2, top: line.y,
      width: boxWidth, height: line.size * 1.25,
      ...(onChange ? { cursor: "move", userSelect: "none", touchAction: "none", outlineWidth: dragging ? 1 : 0, outlineStyle: "solid", outlineColor: "#88888855" } as any : {}),
    }}>
    <Svg width={boxWidth} height={line.size * 1.25} style={{ overflow: "visible" }} pointerEvents="none">
      <G fill={layout.textColor}>
        {outlines.glyphs.map((glyph, index) => <Path key={index} d={glyph.path}
          transform={`translate(${(boxWidth - outlines.width) / 2 + glyph.x} ${line.size * .88 - glyph.rise}) scale(${glyph.scale} ${-glyph.scale})`} />)}
      </G>
    </Svg>
  </View>;
}

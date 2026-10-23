import argparse
import sys
import cv2
import numpy as np

def clean_feline_image(img, cols=1, rows=1):
    h, w = img.shape[:2]
    cw = w // cols
    ch = h // rows

    # Protect eyes from inpainting: detect high saturation/value eye regions (yellow/green/blue eyes)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    eye_protect = cv2.inRange(hsv, (15, 60, 60), (90, 255, 255))
    eye_protect = cv2.dilate(eye_protect, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = np.zeros((h, w), dtype=np.uint8)

    for r in range(rows):
        for c in range(cols):
            ox = c * cw
            oy = r * ch

            # CENTRAL SAFE ZONE: The entire vertical column containing the nose, mouth line decal,
            # and chin spot (between 38% and 62% width) is strictly protected and NEVER touched.
            cx1 = ox + int(cw * 0.38)
            cx2 = ox + int(cw * 0.62)

            # LATERAL WHISKER ZONES: Whiskers only exist on the outer cheek flanks and protrude into the background.
            # Left flank: 6% to 38% | Right flank: 62% to 94%
            lateral_regions = [
                (ox + int(cw * 0.06), cx1, oy + int(ch * 0.20), oy + int(ch * 0.60)),
                (cx2, ox + int(cw * 0.94), oy + int(ch * 0.20), oy + int(ch * 0.60)),
            ]

            for lx1, lx2, ly1, ly2 in lateral_regions:
                lx1 = max(0, min(w, lx1))
                lx2 = max(0, min(w, lx2))
                ly1 = max(0, min(h, ly1))
                ly2 = max(0, min(h, ly2))
                if lx2 <= lx1 or ly2 <= ly1:
                    continue

                sub_gray = gray[ly1:ly2, lx1:lx2]
                sub_mask = np.zeros_like(sub_gray)

                for length in [9, 13, 17, 21]:
                    for angle in [-40, -30, -20, -10, 0, 10, 20, 30, 40]:
                        rad = np.deg2rad(angle)
                        k = np.zeros((length, length), dtype=np.uint8)
                        center = length // 2
                        for radius in range(-center, center + 1):
                            col_idx = int(round(radius * np.cos(rad)))
                            row_idx = int(round(radius * np.sin(rad)))
                            if 0 <= center + row_idx < length and 0 <= center + col_idx < length:
                                k[center + row_idx, center + col_idx] = 1
                        if k.sum() == 0:
                            continue
                        th_bright = cv2.morphologyEx(sub_gray, cv2.MORPH_TOPHAT, k)
                        th_dark = cv2.morphologyEx(sub_gray, cv2.MORPH_BLACKHAT, k)
                        th = cv2.max(th_bright, th_dark)
                        _, th_b = cv2.threshold(th, 14, 255, cv2.THRESH_BINARY)
                        sub_mask = np.maximum(sub_mask, th_b)

                mask[ly1:ly2, lx1:lx2] = sub_mask

            # Enforce hard protection on center zone: mouth, nose, chin spot can NEVER be inpainted
            mask[oy:oy+ch, cx1:cx2] = 0

    # Exclude protected eye areas
    mask[eye_protect > 0] = 0

    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    cleaned = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)
    return cleaned, int(np.sum(mask > 0))

def main():
    parser = argparse.ArgumentParser(description="Deterministic Feline Whisker Suppression")
    parser.add_argument("input_path", help="Path to input image (JPEG or PNG)")
    parser.add_argument("--cols", type=int, default=1, help="Grid columns (default: 1)")
    parser.add_argument("--rows", type=int, default=1, help="Grid rows (default: 1)")
    parser.add_argument("--output", default=None, help="Path to output image (defaults to in-place overwrite)")
    args = parser.parse_args()

    img = cv2.imread(args.input_path)
    if img is None:
        print(f"ERROR: Could not load image from {args.input_path}", file=sys.stderr)
        sys.exit(1)

    cleaned, px_count = clean_feline_image(img, cols=args.cols, rows=args.rows)
    out_path = args.output if args.output else args.input_path
    cv2.imwrite(out_path, cleaned)
    print(f"WHISKER_CLEANED {px_count} pixels in {out_path}")

if __name__ == "__main__":
    main()

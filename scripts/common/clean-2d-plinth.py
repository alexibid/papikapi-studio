import argparse
import sys
import cv2
import numpy as np


def clean_plinth_cutout(img_path: str, out_path: str) -> bool:
    img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
    if img is None or len(img.shape) < 3 or img.shape[2] < 4:
        return False
    h, w = img.shape[:2]
    b, g, r, a = cv2.split(img)
    rgb = cv2.merge([b, g, r])
    hsv = cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV)

    # The plinth slab always sits in the bottom half of the image
    bottom_y = int(h * 0.55)

    # Plinth color: terracotta / orange / brown (H: 2..40 in OpenCV, S: 40..255, V: 50..255)
    is_plinth_color = (hsv[:, :, 0] >= 2) & (hsv[:, :, 0] <= 40) & (hsv[:, :, 1] >= 40) & (hsv[:, :, 2] >= 50)
    is_plinth = np.zeros((h, w), dtype=bool)
    is_plinth[bottom_y:, :] = is_plinth_color[bottom_y:, :] & (a[bottom_y:, :] > 20)

    if not is_plinth.any():
        return False

    # Morphological dilation to encompass anti-aliased edge pixels of the plinth
    plinth_mask = cv2.dilate(is_plinth.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))) > 0

    # Protect white or dark paws from being removed
    paw_protect = (hsv[:, :, 1] < 35) | (hsv[:, :, 2] < 40)
    plinth_to_remove = plinth_mask & ~paw_protect

    # Remove plinth pixels
    a[plinth_to_remove] = 0

    # Clean residual speckles beneath the paws
    paw_pixels = (a > 50) & (hsv[:, :, 1] < 35) & (hsv[:, :, 2] > 140)
    paw_pixels[:bottom_y, :] = False
    ys, xs = np.nonzero(paw_pixels)
    if len(ys) > 0:
        max_paw_y = ys.max()
        a[max_paw_y + 3:, :] = 0

    cleaned = cv2.merge([b, g, r, a])

    # Crop to non-transparent bounding box
    ys, xs = np.nonzero(a > 20)
    if len(ys) == 0:
        return False

    y0, y1 = max(0, ys.min() - 1), min(h, ys.max() + 2)
    x0, x1 = max(0, xs.min() - 1), min(w, xs.max() + 2)
    cropped = cleaned[y0:y1, x0:x1]

    # Pad with symmetric border so figure stands centered
    ch, cw = cropped.shape[:2]
    target_dim = max(ch, cw) + 40
    pad_top = (target_dim - ch) // 2
    pad_bottom = target_dim - ch - pad_top
    pad_left = (target_dim - cw) // 2
    pad_right = target_dim - cw - pad_left

    final_img = cv2.copyMakeBorder(cropped, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_CONSTANT, value=[0, 0, 0, 0])
    cv2.imwrite(out_path, final_img)
    return True


def main():
    parser = argparse.ArgumentParser(description="Clean 2D plinth from cutout image")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("--out", "-o", help="Path to output image (defaults to input)")
    args = parser.parse_args()

    out_path = args.out or args.input
    success = clean_plinth_cutout(args.input, out_path)
    if success:
        print("PLINTH_CLEANED")
    else:
        print("NO_PLINTH_DETECTED")


if __name__ == "__main__":
    main()

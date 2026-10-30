"""Synthetic checks of the plane removal: python3 scripts/stage-1/python/plane_test.py"""
import numpy as np

from plane import hide_plane

BACKGROUND = (229, 229, 229)
FUR = (90, 140, 200)
SIZE = 200


def canvas() -> np.ndarray:
    return np.full((SIZE, SIZE, 3), BACKGROUND, np.uint8)


def figure(image: np.ndarray) -> np.ndarray:
    image[40:170, 70:130] = FUR
    return image


def test_white_plane_goes_and_figure_stays() -> None:
    image = canvas()
    image[150:190, 20:180] = (245, 245, 245)
    image = figure(image)
    hidden, pixels = hide_plane(image, (245, 245, 245))
    assert pixels > 0
    assert np.abs(hidden[180, 30].astype(int) - BACKGROUND).max() <= 3
    assert (hidden[100, 100] == FUR).all()


def test_blue_strip_behind_body_goes_and_tinted_paws_stay() -> None:
    image = canvas()
    image[95:105, 0:SIZE] = (220, 90, 30)
    image = figure(image)
    tinted = (100, 140, 185)
    image[160:170, 70:130] = tinted
    hidden, _ = hide_plane(image, (30, 90, 220))
    assert np.abs(hidden[100, 20].astype(int) - BACKGROUND).max() <= 3
    assert (hidden[165, 100] == tinted).all()
    assert (hidden[60, 100] == FUR).all()


if __name__ == "__main__":
    test_white_plane_goes_and_figure_stays()
    test_blue_strip_behind_body_goes_and_tinted_paws_stay()
    print("plane tests passed")

"""Real-ESRGAN x4plus (Wang et al., BSD-3-Clause): RRDBNet re-implemented, weights from the official release."""
import urllib.request
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

RELEASES = "https://github.com/xinntao/Real-ESRGAN/releases/download"
MODELS = {
    "x4plus": {"blocks": 23, "url": f"{RELEASES}/v0.1.0/RealESRGAN_x4plus.pth"},
    "anime6B": {"blocks": 6, "url": f"{RELEASES}/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"},
}
SCALE = 4
SLOPE = 0.2
RESIDUAL_SCALE = 0.2


class ResidualDenseBlock(nn.Module):
    def __init__(self, features: int = 64, growth: int = 32):
        super().__init__()
        self.conv1 = nn.Conv2d(features, growth, 3, 1, 1)
        self.conv2 = nn.Conv2d(features + growth, growth, 3, 1, 1)
        self.conv3 = nn.Conv2d(features + 2 * growth, growth, 3, 1, 1)
        self.conv4 = nn.Conv2d(features + 3 * growth, growth, 3, 1, 1)
        self.conv5 = nn.Conv2d(features + 4 * growth, features, 3, 1, 1)

    def forward(self, x):
        x1 = F.leaky_relu(self.conv1(x), SLOPE)
        x2 = F.leaky_relu(self.conv2(torch.cat((x, x1), 1)), SLOPE)
        x3 = F.leaky_relu(self.conv3(torch.cat((x, x1, x2), 1)), SLOPE)
        x4 = F.leaky_relu(self.conv4(torch.cat((x, x1, x2, x3), 1)), SLOPE)
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * RESIDUAL_SCALE + x


class RRDB(nn.Module):
    def __init__(self, features: int = 64, growth: int = 32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = (ResidualDenseBlock(features, growth) for _ in range(3))

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * RESIDUAL_SCALE + x


class RRDBNet(nn.Module):
    def __init__(self, features: int = 64, blocks: int = 23, growth: int = 32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, features, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(features, growth) for _ in range(blocks)])
        self.conv_body = nn.Conv2d(features, features, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(features, features, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(features, features, 3, 1, 1)
        self.conv_hr = nn.Conv2d(features, features, 3, 1, 1)
        self.conv_last = nn.Conv2d(features, 3, 3, 1, 1)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = F.leaky_relu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")), SLOPE)
        feat = F.leaky_relu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")), SLOPE)
        return self.conv_last(F.leaky_relu(self.conv_hr(feat), SLOPE))


def ensure_weights(path: Path, variant: str = "x4plus") -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".part")
        urllib.request.urlretrieve(MODELS[variant]["url"], partial)
        partial.rename(path)
    return path


def pick_device() -> str:
    return "mps" if torch.backends.mps.is_available() else "cpu"


def load_model(path: Path, device: str, variant: str = "x4plus") -> RRDBNet:
    model = RRDBNet(blocks=MODELS[variant]["blocks"])
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    model.load_state_dict(checkpoint.get("params_ema", checkpoint.get("params", checkpoint)), strict=True)
    return model.eval().to(device)


@torch.no_grad()
def upscale(model: RRDBNet, image: np.ndarray, device: str, tile: int = 128, pad: int = 16) -> np.ndarray:
    """x4 upscale of an (H, W, 3) uint8 image, tile by tile; the tile borders are cropped away to hide the seams."""
    tensor = torch.from_numpy(np.array(image)).permute(2, 0, 1)[None].float() / 255.0
    _, _, height, width = tensor.shape
    output = torch.zeros(1, 3, height * SCALE, width * SCALE)
    for top in range(0, height, tile):
        for left in range(0, width, tile):
            y0, x0 = max(top - pad, 0), max(left - pad, 0)
            y1, x1 = min(top + tile + pad, height), min(left + tile + pad, width)
            result = model(tensor[:, :, y0:y1, x0:x1].to(device)).float().cpu()
            cy, cx = (top - y0) * SCALE, (left - x0) * SCALE
            core_h, core_w = min(tile, height - top) * SCALE, min(tile, width - left) * SCALE
            output[:, :, top * SCALE : top * SCALE + core_h, left * SCALE : left * SCALE + core_w] = result[:, :, cy : cy + core_h, cx : cx + core_w]
    return (output.clamp(0, 1)[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8)

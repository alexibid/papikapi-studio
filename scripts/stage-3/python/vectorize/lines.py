import numpy as np
from scipy import ndimage
from color_space import srgb_to_lab
def lightness_map(rgb, alpha):
    h,w=alpha.shape
    L=np.full((h,w),100.0)
    inside=alpha>=0.5
    L[inside]=srgb_to_lab(rgb[inside].astype(np.float64))[:,0]
    return L,inside
def dark_line_mask(rgb, alpha, factor, radius=3.5, contrast=18.0, max_l=65.0):
    L,inside=lightness_map(rgb,alpha)
    r=int(round(radius*factor))
    fp=np.zeros((2*r+1,2*r+1),bool)
    yy,xx=np.mgrid[-r:r+1,-r:r+1]; fp=(yy*yy+xx*xx)<=r*r
    closed=ndimage.grey_closing(L,footprint=fp)
    th=closed-L
    return inside&(th>=contrast)&(L<=max_l),th,L

def ink_line_mask(rgb, alpha, factor, radius=3.5, contrast=14.0, max_l=68.0, ink_median_l=48.0, min_area=40):
    mask, th, L = dark_line_mask(rgb, alpha, factor, radius, contrast, max_l)
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    idx = np.arange(1, n + 1)
    med = np.array(ndimage.median(L, lab, idx))
    area = ndimage.sum(np.ones_like(L), lab, idx)
    keep = (med <= ink_median_l) & (area >= min_area * factor * factor)
    return np.isin(lab, idx[keep])

import numpy as np
from PIL import Image
from scipy import ndimage
from color_space import srgb_to_lab
def load(path):
    im=np.asarray(Image.open(path).convert("RGBA"),dtype=np.float64)/255; return im[:,:,:3],im[:,:,3]
def lab_image(rgb,alpha):
    h,w=alpha.shape; lab=np.zeros((h,w,3)); m=alpha>=0.5
    lab[m]=srgb_to_lab(rgb[m]); return lab,m
def gradient(lab,m,sigma=1.0):
    g=np.zeros(m.shape)
    for c in range(3):
        ch=ndimage.gaussian_filter(lab[:,:,c],sigma); gy,gx=np.gradient(ch); g+=gx*gx+gy*gy
    return np.sqrt(g)
def zones(lab,m,factor,thr_pct=90.0,density_sigma=9.0,density_thr=0.12,dilate=5.0,min_area=150.0):
    G=gradient(lab,m,1.0*factor/2)
    inner=ndimage.binary_erosion(m,iterations=int(4*factor))
    vals=G[inner]; T=max(3.0,float(np.percentile(vals,thr_pct)))
    strong=(G>T)&inner
    dens=ndimage.gaussian_filter(strong.astype(np.float32),density_sigma*factor)
    z=dens>density_thr
    z=ndimage.binary_dilation(z,iterations=int(dilate*factor))&inner
    lab_z,n=ndimage.label(z); sizes=ndimage.sum(z,lab_z,np.arange(1,n+1))
    keep=np.isin(lab_z,1+np.nonzero(sizes>=min_area*factor*factor)[0])
    return keep,G,T,dens


def residual_zones(lab, facet_lab, mask, factor, threshold=13.0, smooth=1.0, dilate=2.0, min_area=40.0):
    """Zonas onde a vista original difere da cor da faceta: e ai que existe textura (olhos, nariz, manchas)."""
    difference = np.sqrt(((lab - facet_lab) ** 2).sum(axis=2))
    difference = ndimage.gaussian_filter(difference, smooth * factor)
    inner = ndimage.binary_erosion(mask, iterations=max(1, int(1.5 * factor)))
    zone = (difference > threshold) & inner
    zone = ndimage.binary_opening(zone, iterations=max(1, int(0.8 * factor)))
    zone = ndimage.binary_dilation(zone, iterations=max(1, int(dilate * factor))) & mask
    zone = ndimage.binary_fill_holes(zone) & mask  # reflexos e buracos rodeados de detalhe tambem se desenham
    labels, count = ndimage.label(zone)
    sizes = ndimage.sum(zone, labels, np.arange(1, count + 1))
    keep = np.isin(labels, 1 + np.nonzero(sizes >= min_area * factor * factor)[0])
    return keep, difference

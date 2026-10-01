import numpy

SOLID_THRESHOLD = 0.5
ERODE_PASSES = 2
SPREAD_PASSES = 40
NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def shifted(mask, row, column):
    return numpy.roll(numpy.roll(mask, row, axis=0), column, axis=1)


def eroded(solid):
    for _ in range(ERODE_PASSES):
        solid = solid & shifted(solid, 1, 0) & shifted(solid, -1, 0) & shifted(solid, 0, 1) & shifted(solid, 0, -1)
    return solid


def spread_colours(colours, known):
    colours = colours.copy()
    known = known.copy()
    for _ in range(SPREAD_PASSES):
        for row, column in NEIGHBOURS:
            candidate = shifted(known, row, column) & ~known
            colours[candidate] = shifted(colours, row, column)[candidate]
            known |= candidate
    return colours


def bleed_into_image(image, pixels):
    solid = eroded(pixels[:, :, 3] > SOLID_THRESHOLD)
    colours = spread_colours(pixels[:, :, :3], solid)
    opaque = numpy.concatenate([colours, numpy.ones(pixels.shape[:2] + (1,))], axis=2)
    image.pixels.foreach_set(opaque.astype(numpy.float32).ravel())
    image.update()
    return image

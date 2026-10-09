from math import dist


def edge_owners(pieces):
    owners = {}
    for index, piece in enumerate(pieces):
        for cut in piece["cuts"]:
            owners.setdefault(cut["edge"], []).append(index)
    return owners


def shared_lengths(pieces, owners):
    lengths = {}
    for index, piece in enumerate(pieces):
        for cut in piece["cuts"]:
            for other in owners[cut["edge"]]:
                if other != index:
                    key = (index, other)
                    lengths[key] = lengths.get(key, 0.0) + dist(cut["a"], cut["b"])
    return lengths


def assembly_order(pieces, has_plinth=False):
    owners = edge_owners(pieces)
    lengths = shared_lengths(pieces, owners)
    order = [0] if has_plinth else [max(range(len(pieces)), key=lambda index: pieces[index]["areaMm2"])]
    remaining = set(range(len(pieces))) - set(order)
    while remaining:
        def attachment(candidate):
            return sum(lengths.get((candidate, placed), 0.0) for placed in order)

        following = max(remaining, key=lambda candidate: (attachment(candidate), pieces[candidate]["areaMm2"]))
        order.append(following)
        remaining.discard(following)
    return order


def number_edges(ordered):
    numbers, tab_side = {}, {}
    piece_of_edge = {}
    for position, piece in enumerate(ordered, start=1):
        for cut in piece["cuts"]:
            piece_of_edge.setdefault(cut["edge"], []).append(position)
    for position, piece in enumerate(ordered, start=1):
        for cut in sorted(piece["cuts"], key=lambda item: (item["a"][1], item["a"][0])):
            partners = piece_of_edge[cut["edge"]]
            if len(partners) < 2:
                continue
            if cut["edge"] not in numbers and max(partners) <= position:
                numbers[cut["edge"]] = len(numbers) + 1
                tab_side[cut["edge"]] = (position, cut["face"])
    return numbers, tab_side, piece_of_edge


def attach(ordered):
    numbers, tab_side, piece_of_edge = number_edges(ordered)
    for position, piece in enumerate(ordered, start=1):
        piece["number"] = position
        joins = {}
        for cut in piece["cuts"]:
            if cut["edge"] in numbers:
                cut["number"] = numbers[cut["edge"]]
                cut["tab"] = tab_side[cut["edge"]] == (position, cut["face"])
                partners = [other for other in piece_of_edge[cut["edge"]] if other != position] or [position]
                if cut["tab"]:
                    joins.setdefault(partners[0], []).append(cut["number"])
            else:
                cut["number"] = 0
                cut["tab"] = False
        piece["joins"] = [{"piece": other, "edges": sorted(edges)} for other, edges in sorted(joins.items())]
    return ordered


def order_and_number(pieces, has_plinth=False):
    return attach([pieces[index] for index in assembly_order(pieces, has_plinth)])

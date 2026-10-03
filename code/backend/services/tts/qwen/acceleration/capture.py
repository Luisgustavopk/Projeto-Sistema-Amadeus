import torch


def capture(operation):
    """Warm kernels on a side stream before recording their fixed-shape work."""
    stream = torch.cuda.Stream()
    stream.wait_stream(torch.cuda.current_stream())

    with torch.inference_mode(), torch.cuda.stream(stream):
        for _ in range(3):
            operation()

    torch.cuda.current_stream().wait_stream(stream)
    torch.cuda.synchronize()
    graph = torch.cuda.CUDAGraph()

    with torch.inference_mode(), torch.cuda.graph(graph):
        output = operation()

    return graph, output

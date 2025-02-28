import axios, { AxiosInstance, CancelTokenSource } from "axios"

export interface StreamHandlerOptions<T> {
  url: string
  parseData: (data: string) => T
  onData: (data: T) => void
  onError: (error: unknown) => void
}

/**
 * Creates and manages a Server-Sent Events connection using Axios streaming.
 * Returns a function that can be called to dispose of the connection.
 */
export function createStreamHandler<T>(
  axiosInstance: AxiosInstance,
  options: StreamHandlerOptions<T>,
): {
  dispose: () => void
  cancelTokenSource: CancelTokenSource
} {
  let disposed = false
  const cancelTokenSource = axios.CancelToken.source()

  // Start the streaming request
  axiosInstance
    .get(options.url, {
      responseType: "stream",
      cancelToken: cancelTokenSource.token,
    })
    .then((response) => {
      let buffer = ""

      response.data.on("data", (chunk: Buffer) => {
        if (disposed) {
          return
        }

        const chunkStr = chunk.toString()
        buffer += chunkStr

        // Process each complete SSE message
        const messages = buffer.split("\n\n")
        buffer = messages.pop() || "" // Keep the last incomplete message in buffer

        for (const message of messages) {
          if (message.trim() === "") {
            continue
          }

          // Extract the data part from the SSE message
          const dataMatch = message.match(/^data: (.+)$/m)
          if (dataMatch && dataMatch[1]) {
            try {
              const parsedData = options.parseData(dataMatch[1])
              options.onData(parsedData)
            } catch (error) {
              options.onError(error)
            }
          }
        }
      })

      response.data.on("error", (error: Error) => {
        if (!disposed) {
          options.onError(error)
        }
      })

      response.data.on("end", () => {
        if (!disposed) {
          options.onError(new Error("Stream ended unexpectedly"))
        }
      })
    })
    .catch((error) => {
      if (!disposed) {
        options.onError(error)
      }
    })

  return {
    dispose: () => {
      if (!disposed) {
        cancelTokenSource.cancel("Operation canceled by user")
        disposed = true
      }
    },
    cancelTokenSource,
  }
}

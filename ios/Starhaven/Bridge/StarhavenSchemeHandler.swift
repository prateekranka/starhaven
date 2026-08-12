import Foundation
import WebKit

public final class StarhavenSchemeHandler: NSObject, WKURLSchemeHandler {
    private let router: StarhavenSchemeRouter

    public init(rootURL: URL) {
        router = StarhavenSchemeRouter(rootURL: rootURL)
        super.init()
    }

    public func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        let result = router.response(for: requestURL, method: urlSchemeTask.request.httpMethod ?? "GET")
        let response = HTTPURLResponse(url: requestURL, statusCode: result.statusCode, httpVersion: "HTTP/1.1", headerFields: result.headers) ?? URLResponse(url: requestURL, mimeType: result.mimeType, expectedContentLength: result.body.count, textEncodingName: "utf-8")
        urlSchemeTask.didReceive(response)
        if urlSchemeTask.request.httpMethod?.uppercased() != "HEAD" {
            urlSchemeTask.didReceive(result.body)
        }
        urlSchemeTask.didFinish()
    }

    public func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
}

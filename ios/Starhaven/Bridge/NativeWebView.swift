import SwiftUI
import UIKit
import WebKit

struct StarhavenNativeWebView: UIViewRepresentable {
    @ObservedObject var model: NativeHostModel

    func makeUIView(context: Context) -> StarhavenWebViewContainer {
        StarhavenWebViewContainer(webView: model.webView)
    }

    func updateUIView(_ uiView: StarhavenWebViewContainer, context: Context) {
        uiView.setWebView(model.webView)
    }
}

final class StarhavenWebViewContainer: UIView {
    private var hostedWebView: WKWebView?

    init(webView: WKWebView?) {
        hostedWebView = webView
        super.init(frame: .zero)
        backgroundColor = .clear
        setWebView(webView)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setWebView(_ webView: WKWebView?) {
        guard hostedWebView !== webView else { return }
        hostedWebView?.removeFromSuperview()
        hostedWebView = webView
        guard let webView else { return }
        webView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: trailingAnchor),
            webView.topAnchor.constraint(equalTo: topAnchor),
            webView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}

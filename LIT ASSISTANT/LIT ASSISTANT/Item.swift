//
//  Item.swift
//  LIT ASSISTANT
//
//  Created by Родион Милосердов on 27.04.2026.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}

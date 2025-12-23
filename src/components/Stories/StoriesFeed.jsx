import { motion } from 'framer-motion'
import { Swiper, SwiperSlide } from 'swiper/react'
import { FreeMode } from 'swiper/modules'
import { useState } from 'react'
import StoryModal from './StoryModal'

import 'swiper/css'
import 'swiper/css/free-mode'

export default function StoriesFeed() {
  const [selectedStory, setSelectedStory] = useState(null)
  
  // Mock stories data
  const stories = [
    {
      id: 1,
      tokenName: 'STARSHIB',
      tokenSymbol: 'SSHIB',
      avatar: 'https://via.placeholder.com/80',
      contractHash: 'de1ecc0d030cb2fba62098db5c53ca1b28a9a8e4138dea47ef42f6b285bda423',
      hasNewStory: true
    },
    {
      id: 2,
      tokenName: 'CasperMoon',
      tokenSymbol: 'CMOON',
      avatar: 'https://via.placeholder.com/80',
      contractHash: 'example123',
      hasNewStory: true
    },
    {
      id: 3,
      tokenName: 'RocketToken',
      tokenSymbol: 'RKT',
      avatar: 'https://via.placeholder.com/80',
      contractHash: 'example456',
      hasNewStory: false
    }
  ]
  
  return (
    <>
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          ✨ <span>Stories</span>
        </h2>
        
        <Swiper
          slidesPerView="auto"
          spaceBetween={16}
          freeMode={true}
          modules={[FreeMode]}
          className="!overflow-visible"
        >
          {stories.map((story) => (
            <SwiperSlide key={story.id} className="!w-auto">
              <StoryItem
                story={story}
                onClick={() => setSelectedStory(story)}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </section>
      
      {/* Story Modal */}
      {selectedStory && (
        <StoryModal
          story={selectedStory}
          onClose={() => setSelectedStory(null)}
        />
      )}
    </>
  )
}

function StoryItem({ story, onClick }) {
  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center cursor-pointer group"
    >
      <div className={`relative mb-2 ${
        story.hasNewStory
          ? 'p-1 bg-gradient-to-tr from-primary via-secondary to-pink-500 rounded-full'
          : 'p-1 bg-dark-border rounded-full'
      }`}>
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-dark-card p-1">
          <img
            src={story.avatar}
            alt={story.tokenName}
            className="w-full h-full rounded-full object-cover"
          />
        </div>
        
        {/* New story indicator */}
        {story.hasNewStory && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-primary border-2 border-dark-bg rounded-full" />
        )}
      </div>
      
      <span className="text-xs text-gray-400 group-hover:text-white transition-colors max-w-[80px] truncate">
        {story.tokenSymbol}
      </span>
    </motion.div>
  )
}

import React, { useMemo } from 'react'
import { motion } from 'motion/react'
import Title from './Title'
import { RiSecurePaymentLine, RiSoundModuleLine } from 'react-icons/ri'
import { FaUsersLine } from 'react-icons/fa6'
import { TbLocation } from 'react-icons/tb'

// Highly optimized typewriter text reveal (GPU accelerated, word level)
const TypewriterText = ({ text, className = '', delay = 0, speed = 0.035, as: Component = 'span' }) => {
  const words = useMemo(() => text.split(' '), [text])
  
  const container = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: speed,
        delayChildren: delay,
      },
    },
  }), [delay, speed])

  const child = {
    hidden: { opacity: 0, y: 3 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.18, ease: 'easeOut' },
    },
  }

  return (
    <Component className={className}>
      <motion.span
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0, margin: "100px 0px" }}
        variants={container}
        className="inline"
      >
        {words.map((word, index) => (
          <React.Fragment key={index}>
            <motion.span variants={child} className="inline-block transform-gpu">
              {word}
            </motion.span>
            {index < words.length - 1 && ' '}
          </React.Fragment>
        ))}
      </motion.span>
    </Component>
  )
}

const Achivements = () => {
  const statistics = [
    { label: "Happy Clients", value: 15 },
    { label: "Books Stock", value: 29 },
    { label: "Total Sales", value: 45 },
  ]

  const features = [
    {
      icon: <RiSecurePaymentLine className='text-xl' />,
      title: 'Fast & Secure',
      desc: 'Optimized Performance',
    },
    {
      icon: <RiSoundModuleLine className='text-xl' />,
      title: 'Advance Filtering',
      desc: 'Find items quickly',
    },
    {
      icon: <FaUsersLine className='text-xl' />,
      title: 'User Reviews',
      desc: 'Ratings & Feedback',
    },
    {
      icon: <TbLocation className='text-xl' />,
      title: 'Order Tracking',
      desc: 'Live order status',
    },
  ]

  return (
    <section className='mx-auto max-w-[1440px] overflow-hidden'>
      {/* Container */}
      <div className='flex flex-col xl:flex-row gap-12'>
        
        {/* Left Side: Animated Yellow Card & Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, x: -35 }}
          whileInView={{ opacity: 1, scale: 1, x: 0 }}
          viewport={{ once: true, amount: 0, margin: "100px 0px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className='flex-[2] flex justify-center flex-col bg-gradient-to-l from-yellow-200 px-6 lg:px-12 py-16'
        >
          <h2 className='h2'>
            <TypewriterText text="Our Journey So Far" delay={0.3} speed={0.04} />
          </h2>
          
          <motion.p 
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "100px 0px" }}
            transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className='py-5 max-w-[47rem]'
          >
            From a small idea to a growing library, our journey has been fueled by a love for stories, knowledge, and the joy of sharing books with readers from all walks of life.
          </motion.p>

          {/* Statistic Container */}
          <div className='flex flex-wrap gap-4'>
            {statistics.map((statistic, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0, margin: "100px 0px" }}
                transition={{
                  duration: 0.5,
                  delay: 0.6 + index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className='p-4 rounded-lg'
              >
                <div className='flex items-center gap-1'>
                  <h3 className='text-5xl font-sans'>{statistic.value}</h3>
                  <h4 className='regular-32'>k+</h4>
                </div>
                <p className='capitalize pt-2'>{statistic.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side: New Arrivals */}
        <motion.div
          initial={{ opacity: 0, x: 35 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0, margin: "100px 0px" }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className='flex-1 relative max-sm:pl-8 flex items-center xl:justify-center pt-5'
        >
          <div className='flex-col'>
            <Title
              title1={"New"}
              title2={"Arrivals"}
              title1Styles={"pb-10"}
              paraStyles={"hidden"} 
            />
            <div className='flex flex-col items-start'>
              {features.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "100px 0px" }}
                  transition={{
                    duration: 0.45,
                    delay: 0.3 + index * 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className='flexCenter gap-3 mb-3'
                >
                  {item.icon}
                  <div>
                    <h5 className='h5'>{item.title}</h5>
                    <p>{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  )
}

export default React.memo(Achivements)
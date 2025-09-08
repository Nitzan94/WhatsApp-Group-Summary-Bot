// 🚀 TaskExecutionService v5.0 - DB-Driven Scheduler Execution Layer
// Connects the new scheduler system with the existing AI Agent infrastructure
// Based on enterprise-grade service layer patterns from Context7

const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * TaskExecutionService - מנהל ביצוע משימות מתוזמנות עם AI Agent
 * 
 * Responsibilities:
 * - Execute scheduled tasks from database
 * - Integrate with ConversationHandler (AI Agent)
 * - Log detailed execution metrics
 * - Handle errors gracefully
 * - Provide execution context and monitoring
 */
class TaskExecutionService {
  constructor(db, conversationHandler, bot) {
    this.db = db;
    this.conversationHandler = conversationHandler;
    this.bot = bot;
    this.isInitialized = false;
    this.executionQueue = new Map(); // Track running executions
  }

  /**
   * Initialize the execution service
   */
  async initialize() {
    try {
      if (!this.db || !this.conversationHandler || !this.bot) {
        throw new Error('TaskExecutionService requires db, conversationHandler, and bot instances');
      }

      // Verify v5.0 tables exist
      const hasV5Tables = await this.db.hasV5Tables();
      if (!hasV5Tables) {
        throw new Error('v5.0 database tables not found. Run migration first.');
      }

      this.isInitialized = true;
      logger.info('🚀 TaskExecutionService initialized successfully');
      return true;

    } catch (error) {
      logger.error('❌ TaskExecutionService initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute a scheduled task by ID
   * Main entry point for scheduler
   */
  async executeScheduledTask(taskId) {
    const sessionId = uuidv4();
    const startTime = Date.now();
    let executionLogId = null;

    try {
      logger.info(`🎯 [EXECUTION] Starting task ${taskId} (Session: ${sessionId})`);

      // Load task from database
      const task = await this.db.getScheduledTaskById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (!task.active) {
        logger.warn(`⚠️ Task ${taskId} is inactive, skipping execution`);
        return { success: false, reason: 'Task inactive' };
      }

      // Build AI query based on task type
      const aiQuery = this.buildAIQuery(task);
      logger.info(`🤖 [AI QUERY] ${aiQuery}`);

      // Start execution logging
      executionLogId = await this.db.logTaskExecutionStart(taskId, aiQuery, sessionId);
      
      // Mark execution as running
      this.executionQueue.set(sessionId, {
        taskId,
        executionLogId,
        startTime,
        status: 'running'
      });

      // Execute via ConversationHandler (AI Agent)
      const executionResult = await this.executeViaAI(task, aiQuery, sessionId);

      // Log execution completion
      await this.logExecutionEnd(executionLogId, executionResult, startTime);

      // Update task next execution time (handled by SchedulerService)
      logger.info(`✅ [EXECUTION] Task ${taskId} completed successfully`);

      // Remove from execution queue
      this.executionQueue.delete(sessionId);

      return {
        success: true,
        sessionId,
        taskId,
        executionTime: Date.now() - startTime,
        result: executionResult
      };

    } catch (error) {
      logger.error(`❌ [EXECUTION] Task ${taskId} failed:`, error);

      // Log failure if we have a log ID
      if (executionLogId) {
        await this.logExecutionEnd(executionLogId, {
          success: false,
          error_message: error.message,
          ai_response: null,
          output_message: null
        }, startTime);
      }

      // Remove from execution queue
      this.executionQueue.delete(sessionId);

      return {
        success: false,
        error: error.message,
        sessionId,
        taskId,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Build AI query based on task configuration
   */
  buildAIQuery(task) {
    const { action_type, target_groups, custom_query } = task;

    // Use custom query if provided
    if (custom_query) {
      return `${custom_query}\n\nקבוצות לבדיקה: ${target_groups.join(', ')}`;
    }

    // Generate query based on action type
    const queryTemplates = {
      'daily_summary': `תן לי סיכום יומי מהקבוצות הבאות: ${target_groups.join(', ')}. כלול את הנושאים הכי חשובים שנדברו היום.`,
      
      'weekly_summary': `תן לי סיכום שבועי מהקבוצות הבאות: ${target_groups.join(', ')}. מה היו הנושאים המרכזיים השבוע?`,
      
      'today_summary': `מה קרה היום בקבוצות הבאות: ${target_groups.join(', ')}? תן לי סיכום של הפעילות והדיונים מהיום.`,
      
      'latest_message': `מה ההודעות האחרונות מהקבוצות הבאות: ${target_groups.join(', ')}? תציג את העדכונים הכי חדשים.`,
      
      'group_analytics': `תן לי ניתוח פעילות מתקדם עבור הקבוצות: ${target_groups.join(', ')}. כלול סטטיסטיקות ומגמות.`
    };

    return queryTemplates[action_type] || queryTemplates['daily_summary'];
  }

  /**
   * Execute task via ConversationHandler (AI Agent)
   */
  async executeViaAI(task, aiQuery, sessionId) {
    const aiStartTime = Date.now();
    
    // Create execution context for AI (outside try-catch so it's available in catch)
    const context = this.buildExecutionContext(task, sessionId);
    
    try {
      logger.info(`🧠 [AI AGENT] Processing query for task ${task.id}`);

      // Call ConversationHandler (existing AI Agent system)
      const aiResponse = await this.conversationHandler.processNaturalQuery(
        aiQuery,
        context.groupId, // Use send_to_group as context
        'scheduled-task', // User type
        true, // forceGroupQuery
        'system', // userId
        'TaskExecutionService' // userName
      );

      const aiProcessingTime = Date.now() - aiStartTime;
      logger.info(`🤖 [AI AGENT] Processing completed in ${aiProcessingTime}ms`);

      // Extract tool usage and metrics from AI response
      const toolsUsed = this.extractToolsUsed(aiResponse);
      const analysisData = this.extractAnalysisData(aiResponse);

      // Send result to target group
      const sendSuccess = await this.sendResultToGroup(
        task.send_to_group, 
        aiResponse.response || aiResponse,
        task.name
      );

      return {
        success: true,
        ai_response: aiResponse.response || aiResponse,
        ai_model: 'claude-3.5-sonnet',
        ai_tokens_used: aiResponse.tokensUsed || 0,
        ai_processing_time: aiProcessingTime,
        tools_used: toolsUsed,
        tools_data: analysisData,
        database_queries: analysisData.database_queries || 0,
        database_results: analysisData.database_results || 0,
        output_message: aiResponse.response || aiResponse,
        output_sent_to: sendSuccess ? task.send_to_group : null,
        groups_processed: task.target_groups.length,
        messages_analyzed: analysisData.messages_analyzed || 0,
        execution_context: context
      };

    } catch (error) {
      const aiProcessingTime = Date.now() - aiStartTime;
      logger.error(`❌ [AI AGENT] Failed to process task ${task.id}:`, error);

      return {
        success: false,
        error_message: error.message,
        ai_processing_time: aiProcessingTime,
        ai_response: null,
        output_message: null,
        execution_context: context
      };
    }
  }

  /**
   * Build execution context for AI Agent
   */
  buildExecutionContext(task, sessionId) {
    // Find group ID for send_to_group (ConversationHandler expects groupId)
    // This will be handled by the existing group resolution in ConversationHandler
    
    return {
      sessionId,
      taskId: task.id,
      taskName: task.name,
      actionType: task.action_type,
      targetGroups: task.target_groups,
      isScheduledExecution: true,
      executionTime: new Date().toISOString(),
      groupId: null // Will be resolved by ConversationHandler based on send_to_group
    };
  }

  /**
   * Extract tools used from AI response
   */
  extractToolsUsed(aiResponse) {
    try {
      // If AI response includes tool usage information
      if (aiResponse.toolCalls) {
        return aiResponse.toolCalls.map(call => call.function?.name).filter(Boolean);
      }
      
      // Default to common tools for scheduled tasks
      return ['search_groups', 'get_recent_messages'];
    } catch (error) {
      logger.warn('Failed to extract tools used:', error);
      return [];
    }
  }

  /**
   * Extract analysis data and metrics from AI response
   */
  extractAnalysisData(aiResponse) {
    try {
      // Extract metrics if available in response
      return {
        database_queries: aiResponse.metrics?.database_queries || 0,
        database_results: aiResponse.metrics?.database_results || 0,
        messages_analyzed: aiResponse.metrics?.messages_analyzed || 0,
        processing_details: aiResponse.metrics || null
      };
    } catch (error) {
      logger.warn('Failed to extract analysis data:', error);
      return {
        database_queries: 0,
        database_results: 0,
        messages_analyzed: 0
      };
    }
  }

  /**
   * Send execution result to target group
   */
  async sendResultToGroup(groupName, message, taskName) {
    try {
      // Use bot's existing message sending mechanism
      if (this.bot && this.bot.sendMessageToGroup) {
        const fullMessage = `🤖 **${taskName}**\n\n${message}\n\n_נוצר אוטומטית על ידי מערכת התזמון החדשה v5.0_`;
        await this.bot.sendMessageToGroup(groupName, fullMessage);
        logger.info(`📤 [SEND] Message sent to group: ${groupName}`);
        return true;
      } else {
        logger.warn(`⚠️ [SEND] Bot instance not available, cannot send to ${groupName}`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ [SEND] Failed to send message to ${groupName}:`, error);
      return false;
    }
  }

  /**
   * Log execution completion with detailed metrics
   */
  async logExecutionEnd(executionLogId, executionResult, startTime) {
    try {
      const totalExecutionTime = Date.now() - startTime;
      const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024); // MB

      const logData = {
        ...executionResult,
        total_execution_time: totalExecutionTime,
        memory_usage: memoryUsage,
        execution_type: 'scheduled'
      };

      await this.db.logTaskExecutionEnd(executionLogId, logData);
      logger.debug(`📊 [LOG] Execution ${executionLogId} logged with ${totalExecutionTime}ms total time`);

    } catch (error) {
      logger.error('❌ Failed to log execution end:', error);
    }
  }

  /**
   * Get current execution status
   */
  getExecutionStatus() {
    const runningExecutions = Array.from(this.executionQueue.values());
    
    return {
      running_executions: runningExecutions.length,
      executions: runningExecutions.map(exec => ({
        sessionId: exec.sessionId,
        taskId: exec.taskId,
        startTime: exec.startTime,
        duration: Date.now() - exec.startTime,
        status: exec.status
      }))
    };
  }

  /**
   * Execute task manually (for testing/debugging)
   */
  async executeManually(taskId, userId = 'manual') {
    logger.info(`🔧 [MANUAL] Manual execution requested for task ${taskId} by ${userId}`);
    
    const result = await this.executeScheduledTask(taskId);
    
    // Update execution type in logs
    if (result.success && result.executionLogId) {
      await this.db.runQuery(
        'UPDATE task_execution_logs SET execution_type = ? WHERE id = ?',
        ['manual', result.executionLogId]
      );
    }

    return result;
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(days = 7) {
    try {
      return await this.db.getExecutionStats(days);
    } catch (error) {
      logger.error('❌ Failed to get execution stats:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  isHealthy() {
    return this.isInitialized && 
           this.db && this.db.isReady() &&
           this.conversationHandler &&
           this.bot;
  }
}

module.exports = TaskExecutionService;